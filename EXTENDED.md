SPIRA — Extended Technical Notes

This is the deeper companion to `README.md`: architecture, the math behind each operation in more
detail, the export pipeline, verification methodology, and known limitations. `README.md` is the
quick tour; this is for anyone extending the code or wiring the Revit pipeline into their own
workflow.

## Architecture

Single HTML file (`index.html`), no build step, Three.js r128 loaded via CDN. Deployed straight
from a GitHub repo to Netlify — commit and it's live.

State lives in one `state` object, persisted to `localStorage` on every change (`persist()`). A
single `rebuild()` function is the entry point for anything that changes the model: it reads
`state`, constructs geometry via `buildDeformedGeometry()` (Twist/Taper/Shear/Bend/Free) or
`buildHelicalGeometry()` (Helix), and updates every dependent piece of UI (HUD readouts, overlays,
footer summary) in one pass. Every slider, preset button, and mode switch ultimately just mutates
`state` and calls `rebuild()`.

`computeLayerPoint(mode, params, y, h, p)` is the single source of truth for "where does profile
point `p` end up at height `y`, under this operation's parameters." Every consumer — the render
mesh, the cap/side geometry builders, the loft-profiles JSON exporter, the camera-fit bounding box
— calls through this one function rather than re-deriving the transform, so there's exactly one
place that can be wrong for any given operation's math.

`lastBuild` (`{mode, profile, params, h, closed, n}`) is captured at the end of every `rebuild()`
and is what the loft-profiles exporter re-samples from — it doesn't read geometry back out of the
Three.js render mesh, it recomputes fresh via `computeLayerPoint` using the exact same inputs the
render used, so the export is guaranteed to match what's on screen rather than risking a second,
drifting implementation of the same math.

## The math, per operation

All six operations take a 2D cross-section profile (a closed polygon in the x–z plane, or for Helix
a generator curve) and a height `h`, and produce a world-space point for every (profile point,
height) pair via `computeLayerPoint`.

**Twist.** `α(z) = (z/h)·α_max`, linear from 0 at the base to `α_max` at the top. Every profile
point at height `z` gets rotated by `α(z)` about the vertical axis. Since rotation is rigid (it
doesn't stretch or shear anything), Cavalieri's principle applies directly: every horizontal
cross-section has exactly the same area as the undeformed prism's cross-section at that height, so
the total volume is unchanged — provable without touching the volume formula at all, and the app
verifies this numerically (mesh integration vs. the straight-prism formula) rather than just
asserting it.

**Taper.** `v(z) = 1 + (z/h)·(v−1)` and `w(z) = 1 + (z/h)·(w−1)`, independent linear scale factors
in x and z. Scaling is *not* rigid — cross-sectional area changes with height — so volume is not
preserved in general. The HUD reports the actual ratio (deformed volume / prism volume) rather than
assuming equality.

**Shear.** Each slice translates by `(Δx·(z/h), Δy·(z/h))` within its own horizontal plane — linear
from `(0,0)` at the base to `(Δx,Δy)` at the top. This is the one operation that's a genuinely
*global* affine transform of the whole solid (every point's displacement depends only on its height,
linearly), which has a useful consequence: affine maps take planes to planes, so every original flat
side face of the polygon stays exactly flat after shearing, at any resolution — not an
approximation. (This is why Shear's side walls could collapse to one flat ACIS face each when the
project still had a `.sat` exporter — see the CHANGELOG for that history.)

**Bend.** The axis maps to a circular arc of radius `R = h/β` (chosen so the arc length exactly
equals the original straight axis length `h` — an equal-arc-length convention, not equal-chord).
Each slice rotates and translates (never scales) into the plane normal to that arc at parameter
`θ(z) = β·(z/h)`, with the profile's local x-coordinate passed straight through unchanged — so it's
really a 2D bend happening in the y–z plane, extruded along x. Rigid per slice, so volume-preserving
like Twist and Shear.

**Free (FFD).** No axis, no base plane — the whole solid sits in a bounding cuboid with 8 corner
control points `b_ijk` (i,j,k ∈ {0,1}), and every point in the solid is a trilinear Bézier blend:
`b(u,v,w) = Σ B_i(u)·B_j(v)·B_k(w)·b_ijk` where each `B` is a degree-1 Bernstein basis function
(i.e. plain linear interpolation along each axis). An arbitrary trilinear warp has no closed-form
volume, so this is the one mode where the HUD's volume reading comes from actual numeric mesh
integration (divergence theorem) rather than a derived formula.

**Helix.** Structurally different from the other five — it sweeps a generator curve by helical
motion rather than deforming a solid cross-section: `x = X(v)·cos(u)`, `z = X(v)·sin(u)`,
`y = Y(v) + p·u`, where `(X(v), Y(v))` is the generator's own 2D shape and `p` is rise-per-radian
(pitch / 2π). Three generator presets: **Line** (a straight segment orthogonal to the axis — the
common/right helicoid, the classic open spiral ramp/stair surface), **Circle** (a circle lying
flat in the meridian plane, producing a winding tube), and **Pipe** (the true constant-radius pipe).
Pipe doesn't fit the `X(v)cos(u), X(v)sin(u)` formula above at all — it needs its own construction
(`pipeFrenetPoint`), since the circle has to stay orthogonal to the *local tangent* of the helix
centerline rather than sitting flat in a fixed plane. The centerline is itself a circular helix
`C(u) = (R₀cos(u), p·u, R₀sin(u))`; its Frenet frame is analytic and well-behaved everywhere (no
rotation-minimizing-frame machinery needed) because a circular helix has constant curvature and
torsion:
- Tangent `T = C′(u) / |C′(u)|`, where `C′(u) = (−R₀sin(u), p, R₀cos(u))`.
- Normal `N = C″(u) / |C″(u)|`, where `C″(u) = (−R₀cos(u), 0, −R₀sin(u))` — already unit length
  (its magnitude is exactly `R₀`, dividing by which leaves a unit vector), and `C′(u)·C″(u) = 0`
  for every `u`, so `N` needs no re-orthogonalization against `T` the way an arbitrary space curve's
  normal would.
- Binormal `B = T × N`, completing a right-handed frame.

A generator point at cross-section angle `θ` and radius `r` places as
`C(u) + r·(cos(θ)·N + sin(θ)·B)`. `buildHelicalGeometry()` was refactored to accept an optional
`evalPoint(y, genPt)` callback specifically so Pipe could reuse the same topology/winding/cap code
as Line and Circle rather than duplicating it — Line and Circle still use the default callback (the
ordinary `X(v)cos(u)` formula via `computeLayerPoint`), Pipe supplies `pipeFrenetPoint` instead.
Outward-normal orientation and NaN-freedom were checked headlessly (Node + three.js) across a plain
untwisted case and a multi-turn twisted case before shipping. A helicoid has no enclosed volume in
general (the Line generator in particular leaves a hole around the axis with zero wall thickness),
so the HUD reports surface area instead, again via numeric mesh integration rather than a formula.

## Geometry construction

`buildDeformedGeometry()` builds the side surface as `(segments+1)` horizontal layers × `n` profile
points, each layer computed via `computeLayerPoint`. Adjacent layers form quads that generally
aren't planar (a twisted or bent quad has real curvature across it), so each quad is triangulated by
picking whichever diagonal is *shorter* — this minimizes the dihedral crease at the triangulation
seam, though it can't eliminate it entirely for a non-planar quad. Both side and cap materials use
`flatShading:true`: with the default smooth shading, Three.js averages vertex normals across
adjacent triangles, and since the shorter-diagonal choice can flip direction from quad to quad,
smooth shading was blending together inconsistently-oriented triangles into a false
herringbone/"pinched" light pattern that didn't correspond to any real edge. Flat shading — each
triangle rendered with its own true face normal — is both the fix and the more geometrically honest
choice, since the surface actually is faceted at any finite resolution.

Caps (top and bottom) are triangulated via `THREE.ShapeUtils.triangulateShape`, which handles the
star preset's concave vertices correctly (a simple fan triangulation would produce wrong results for
a non-convex polygon).

`buildHelicalGeometry()` follows the same layer-based approach but sweeps a generator curve through
an angle `u` rather than rotating/scaling a fixed cross-section, and caps are only built for closed
generators (the Circle preset; Line's open ribbon has no caps by design).

## Camera framing

`frameCameraDefault()` fits an actual Three.js `Box3` computed from the rendered solid — the
circumscribed-sphere radius of that box, checked against both horizontal and vertical FOV (whichever
is more restrictive, so it doesn't under-frame a wide/short shape when the viewport happens to be
narrower than tall), with 15% padding. This runs once, on the very first `rebuild()` after boot
(`hasFramedOnce` guards against re-running it on every subsequent slider change, so mid-session
zoom/orbit is never disturbed) — and again whenever the Home button is clicked.

## Export pipeline: loft profiles → Dynamo

The exported `.json` schema (`spira-loft-profiles-v1`):

```
{
  "schema": "spira-loft-profiles-v1",
  "app_version": "...",
  "mode": "twist" | "taper" | "shear" | "bend" | "ffd" | "helix",
  "units": "mm",
  "axis_convention": "...",
  "closed": true | false,          // false only for Helix's open Line generator
  "profile_point_count": n,
  "height_mm": ...,
  "level_count": N,
  "levels": [
    { "t": 0.0, "height_mm": 0, "points": [[x,y,z], ...] },
    ...
  ]
}
```

Coordinates are millimeters, remapped from SPIRA's internal Three.js convention (Y is vertical) to
the Z-up convention shared by Revit, AutoCAD, and most CAD/BIM kernels: `(x,y,z) → (x,−z,y)`. This
is a pure rotation (same determinant), so it doesn't affect winding or handedness anywhere
downstream.

`level_count` (the "loft profiles" slider) is deliberately a *separate* control from "resolution
(slices)": the render/on-screen resolution needs enough triangles to look smooth as flat facets, but
a native Revit loft only needs enough profile curves for Revit's own curve-fitting to converge to
the right shape — usually far fewer. Conflating the two would force a tradeoff between screen
smoothness and export file size that doesn't actually need to exist.

**The bundled Dynamo script** (`spira_import_loft_dynamo.py`, also downloadable from the app itself)
reads this JSON and, via a Python Script node with direct RevitAPI access:

1. Validates the schema and that every level has a consistent point count.
2. Builds a `CurveLoop` per level (straight `Line` segments between the profile's own points — the
   *loft* across levels, not anything within a single cross-section, is where the curve-fitting for
   Twist/Taper/Bend actually happens).
3. Calls `GeometryCreationUtilities.CreateLoftGeometry(loops, options)` to get a genuine
   Revit-kernel `Solid`.
4. Places it depending on which document is active:
   - **A Conceptual Mass family document** → `FreeFormElement.Create(doc, solid)`, a real Mass
     Form — the same kind of element Revit's own Loft/Extrude form tools create. Save the family
     and use *Load into Project* for a genuine, reusable, loadable Mass Family.
   - **A regular project document** → `DirectShape.CreateElement` in the **Mass** category (not
     Generic Models — Revit's Wall/Curtain System/Roof "by Face" tools specifically require
     Mass-category elements as valid face hosts).
5. Returns the solid converted via `.ToProtoType()` (`Revit.GeometryConversion` extension) so it
   also renders in Dynamo's own background 3D preview — a raw `Autodesk.Revit.DB.Solid` is opaque
   to Dynamo's canvas, which only draws its native `ProtoGeometry` types.

Helix's open Line generator (`closed: false`) has no solid interior to loft — the script detects
this and stops with a clear message rather than attempting `CreateLoftGeometry` on an open profile
and producing something wrong. A ribbon/open-sheet surface would need a different API
(`CreateRuledGeometry` or similar) and isn't implemented.

**Why this approach instead of a faceted CAD export:** an earlier version of this project exported a
faceted ACIS solid (`.sat`) directly from SPIRA, matching the on-screen triangulation exactly. That
worked, but every curved operation's side walls necessarily came in as hundreds of small flat
triangular faces — geometrically correct, but unusable for picking a single face to host a curtain
wall or apply a panelization pattern, since "the whole side" was actually hundreds of separate ACIS
faces. Real curved ACIS surfaces (spline/ruled `spl_sur`) would fix that, but hand-authoring that
part of the ACIS SAT format has no verified worked-example syntax to check against — a real risk
given how many correctness bugs turned up even in the simple flat-facet writer. Handing the actual
curve-fitting to Revit's own kernel via a native loft sidesteps that risk entirely and gives a
strictly better result (one genuine curved face per side) for the modes that matter most (Twist,
Taper, Bend). The `.sat` exporter was removed once this path was working end-to-end; see the
CHANGELOG in `index.html` for that history.

## Verification approach

Every operation's volume (or surface area, for Helix) claim was checked numerically before shipping,
not just asserted from the derivation: mesh-based integration (divergence theorem for volume)
compared against the closed-form formula where one exists (Twist/Taper/Shear/Bend), and used
directly as the only source of truth where no closed form exists (Free, Helix). The loft-profiles
JSON exporter's coordinate math was checked by hand against a known case (a 90° twist: the bottom
profile point comes out unrotated, the top point rotated exactly 90° in the expected direction) in
addition to structural checks (schema validity, consistent point counts). The Dynamo script's
document-branching logic (Mass family → `FreeFormElement`; non-Mass family → a clear error, not a
wrong result; project document → `DirectShape`) was verified against stand-in document objects
before being handed over, and then confirmed working end-to-end in an actual Revit session.

## Known limitations

- Helix's open Line generator can't be exported through the current loft pipeline (no solid
  interior); would need a ruled-surface approach instead. Pipe and Circle are both closed generators
  and export the same way every other closed mode does.
- Free/FFD's caps aren't guaranteed to stay flat under an arbitrary control-point drag (an offset
  corner control point can bend even the "flat" top/bottom), so any code path that assumes flat caps
  for other modes explicitly excludes FFD.
