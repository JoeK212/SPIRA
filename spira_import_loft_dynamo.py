# -*- coding: utf-8 -*-
"""
Import a SPIRA "loft profiles" JSON export as a native Revit solid -- Dynamo version.

Builds a genuine Revit-kernel solid through SPIRA's exported cross-section
profiles via GeometryCreationUtilities.CreateLoftGeometry. Because Revit's own
kernel fits the loft, a curved operation (Twist/Taper/Bend) comes in as real
curved faces -- pick one side and you get the whole side, not one triangle out
of a few hundred, which is what a flat-faceted import would give for those modes.

WHERE THE GEOMETRY GOES depends on what document is active when you run this:
  - A Conceptual Mass FAMILY document (File -> New -> Family -> Conceptual
    Mass template, or an already-open one): builds a real FreeFormElement --
    a genuine Mass Form, the same kind of element the Family Editor's own
    form tools create. Save the family and use "Load into Project" to bring
    a real, reusable, loadable Mass Family into any project.
  - A regular PROJECT document: falls back to a DirectShape in the Mass
    category, placed directly in that project -- pickable by Wall/Curtain/
    Roof by Face, but a one-off element in this project only, not a loadable
    family.

Run Dynamo directly from whichever document you want the geometry to end up
in -- open Family1.rfa (or a fresh Conceptual Mass family) and launch Dynamo
from THAT document's own Manage tab if you want a Mass Form; launch it from
a project if you want the DirectShape. Each Dynamo session stays attached to
whichever document was active when it was launched.

SETUP (one-time, ~2 minutes):
  1. With the target document active (family or project): Manage tab -> Dynamo -> New.
  2. Add a "File Path" node, click its file icon, browse to a SPIRA .json export.
  3. Add a "Python Script" node, wire File Path's output into its IN[0].
  4. Double-click the Python Script node, select all the placeholder code,
     paste this entire file in its place.
  5. Run the graph (checkmark / Run button in the top toolbar).

Re-running with a different file path (or re-picking the file) imports a
different export without touching the graph itself.

A note on an earlier, overstated caution: this uses a Python Script node
making direct RevitAPI calls, not Dynamo's built-in Revit nodes (Wall.ByFace
etc., which really are project-oriented and less reliable in a family
document) -- a Python node talks to the RevitAPI the same way regardless of
which kind of document is active, so it should work fine here too.

SCOPE, v1: only closed cross-sections (Twist/Taper/Shear/Bend/Free, and
Helix's 'circle' generator). Helix's open 'line' generator (a ribbon, not a
solid) needs a surface-building approach instead of CreateLoftGeometry and
isn't handled here -- the node errors out with a clear message rather than
silently building the wrong thing.
"""

import clr
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')
clr.AddReference('RevitNodes')
import Revit
clr.ImportExtensions(Revit.GeometryConversion)  # adds .ToProtoType() to RevitAPI geometry --
                                                  # the raw Autodesk.Revit.DB.Solid this script
                                                  # builds is opaque to Dynamo's own 3D canvas,
                                                  # which only draws its native geometry types
from Autodesk.Revit.DB import (
    XYZ, Line, CurveLoop, GeometryCreationUtilities, SolidOptions,
    ElementId, BuiltInCategory, DirectShape, FreeFormElement,
)
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

import json

doc = DocumentManager.Instance.CurrentDBDocument

MM_PER_FOOT = 304.8


def mm_to_ft(value_mm):
    return value_mm / MM_PER_FOOT


def load_spira_json(path):
    with open(path, "r") as f:
        data = json.load(f)

    schema = data.get("schema")
    if schema != "spira-loft-profiles-v1":
        raise ValueError(
            "Not a SPIRA loft-profiles export (expected schema "
            "'spira-loft-profiles-v1', got '{}'). Export it from SPIRA's "
            "sidebar: Export section -> 'Export loft profiles (.json)'.".format(schema)
        )

    levels = data.get("levels", [])
    if len(levels) < 2:
        raise ValueError("Only {} level(s) in this export -- need at least 2 "
                          "to loft through.".format(len(levels)))

    point_counts = set(len(lv["points"]) for lv in levels)
    if len(point_counts) != 1:
        raise ValueError("Levels have inconsistent profile point counts: {} "
                          "-- that shouldn't happen from a normal SPIRA "
                          "export.".format(sorted(point_counts)))

    return data


def build_curve_loop(points_mm, closed):
    """One level's profile points -> a Revit CurveLoop of straight Line segments.

    SPIRA's cross-sections are already straight-edged polygons, so each level
    only needs straight lines between its own points -- the *loft* across
    levels is where CreateLoftGeometry does the actual curve fitting for
    Twist/Taper/Bend, not anything at the single-level/cross-section level.
    """
    pts_ft = [
        XYZ(mm_to_ft(p[0]), mm_to_ft(p[1]), mm_to_ft(p[2]))
        for p in points_mm
    ]
    n = len(pts_ft)
    edge_count = n if closed else n - 1

    loop = CurveLoop()
    for i in range(edge_count):
        a = pts_ft[i]
        b = pts_ft[(i + 1) % n]
        if a.DistanceTo(b) < 1e-9:
            continue  # skip a degenerate zero-length edge rather than crash
        loop.Append(Line.CreateBound(a, b))
    return loop


def build_loft_solid(data):
    closed = data.get("closed", True)
    if not closed:
        raise ValueError(
            "This export is an open profile (closed: false) -- SPIRA's "
            "Helix 'line' generator, which has no solid interior to loft. "
            "This script only builds closed-profile solids (Twist/Taper/"
            "Shear/Bend/Free, and Helix's 'circle' generator)."
        )

    loops = [build_curve_loop(level["points"], closed) for level in data["levels"]]

    solid_options = SolidOptions(ElementId.InvalidElementId, ElementId.InvalidElementId)
    try:
        solid = GeometryCreationUtilities.CreateLoftGeometry(loops, solid_options)
    except Exception as ex:
        raise ValueError(
            "Revit's loft builder rejected these profiles: {}\n\n"
            "This can happen with a large twist/bend angle and too few loft "
            "profiles -- try raising SPIRA's 'loft profiles' slider before "
            "re-exporting, or reducing the deformation angle.".format(ex)
        )

    return solid


def place_geometry(doc, solid, data):
    label = "SPIRA {} loft ({} levels)".format(
        data.get("mode", "?"), data.get("level_count", len(data["levels"]))
    )

    if doc.IsFamilyDocument:
        owner_category_id = doc.OwnerFamily.FamilyCategory.Id
        mass_category_id = ElementId(BuiltInCategory.OST_Mass)
        if owner_category_id != mass_category_id:
            raise ValueError(
                "This family document's category is '{}', not Mass. "
                "FreeFormElement.Create (the API for adding a genuine Mass "
                "Form) needs a Conceptual Mass family -- start a new family "
                "from the Conceptual Mass template (File -> New -> Family) "
                "and run this graph with that document active instead.".format(
                    doc.OwnerFamily.FamilyCategory.Name
                )
            )

        # A genuine Mass Form -- the same kind of element the Family Editor's
        # own form tools (Extrude, Loft, etc.) create. Once this family is
        # saved and loaded into a project ("Load into Project" on the ribbon),
        # it's a real, reusable, loadable Mass Family with pickable faces --
        # not a one-off element tied to a single project the way a DirectShape is.
        TransactionManager.Instance.EnsureInTransaction(doc)
        ffe = FreeFormElement.Create(doc, solid)
        TransactionManager.Instance.TransactionTaskDone()
        return ffe, "FreeFormElement (Mass Form) inside this family document"

    else:
        # Regular project document: no family/form concept to build into, so
        # fall back to a DirectShape in the Mass category -- pickable by Wall/
        # Curtain/Roof by Face same as a Mass Form, but a one-off element
        # local to this project, not a loadable family.
        category_id = ElementId(BuiltInCategory.OST_Mass)
        TransactionManager.Instance.EnsureInTransaction(doc)
        ds = DirectShape.CreateElement(doc, category_id)
        ds.SetShape([solid])
        ds.Name = label
        TransactionManager.Instance.TransactionTaskDone()
        return ds, "DirectShape (Mass category) in this project -- not a loadable family"


# ---- Dynamo node entry point ----
# IN[0]: file path string, wired from a "File Path" node (see setup notes above)
path = IN[0]

spira_data = load_spira_json(path)
loft_solid = build_loft_solid(spira_data)
element, placement_desc = place_geometry(doc, loft_solid, spira_data)

status = "Imported {} -- mode '{}', {} levels, {:.1f} m tall. Placed as {}. Element id {}.".format(
    path, spira_data.get("mode", "?"), spira_data.get("level_count", len(spira_data["levels"])),
    spira_data.get("height_mm", 0) / 1000.0, placement_desc, element.Id
)
if doc.IsFamilyDocument:
    status += " Next: save this family, then use Load into Project to bring it into a project."
print(status)

# Returning the Solid is what lets Dynamo draw it, but only once converted to
# Dynamo's own geometry type via ToProtoType() -- the raw RevitAPI Solid that
# FreeFormElement/DirectShape actually used above is a different type Dynamo's
# canvas can't render directly. The document element itself was already built
# from the original (unconverted) solid, so this conversion only affects the
# preview, not what got placed in the model.
OUT = loft_solid.ToProtoType()
