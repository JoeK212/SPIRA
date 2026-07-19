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

## Panel flatness / warp

`computePanelWarp(profile, layerPointFn, n, closed, loopCount, stepM)` measures how far each real
floor-to-floor, edge-to-edge panel deviates from flat — the four corners a fabricator or
curtain-wall panel would actually be cut from, sampled via `layerPointFn` at two adjacent
floor/turn boundaries and two adjacent profile/generator points, not the fine render mesh.

The metric is the standard curtain-wall "twist" tolerance definition, not a least-squares fit
across all four points: fit a plane through three of the panel's corners (`p00`, `p01`, `p10` —
`normal = normalize(cross(p01-p00, p10-p00))`), then take the signed perpendicular distance of the
fourth corner (`p11`) from that plane. This is how flatness tolerance is actually specified and
measured in glazing/cladding practice, and it's a single well-defined scalar per panel rather than
requiring a fitting procedure.

The function always runs on every `rebuild()` regardless of the overlay toggle — it's cheap
(floors × edges, not floors × render resolution: a 100-floor, 8-edge model is 800 panels, not
tens of thousands), so the HUD's "max panel warp" row stays live even with the visual overlay off.
Only the colored quad mesh itself (`state.overlays.panelwarp`) is gated behind the toggle. Each
panel is rendered as two triangles with matching per-vertex colors from `warpColor()` — a green
(`0x2f9e44`) → amber (`0xf2c14e`) → red (`0xc0392b`) gradient over an illustrative 0–50mm range,
the same "illustrative, not a sourced spec" framing used for the case-study footprint estimates —
and nudged outward from each panel's own centroid by 3%, the same technique slice rings and floor
lines use to avoid z-fighting with the coincident solid surface.

Applies uniformly across all six modes via the same `layerPointFn`/`profile`/`closed`/`loopCount`/
`stepM` pattern as floor lines and the normals overlay (`floors`/`floorHeightM` for the first five
modes) — Helix is the one exception to the pattern-sharing: it uses the render resolution (`segs`,
`h/segs`) rather than `helixTurns`/`helixPitchM`, because a "panel" spanning one entire 360-degree
turn isn't a real fabrication unit the way a floor-to-floor curtain-wall panel is, and for the Line
generator specifically (only 2 profile points, 1 edge spanning the whole ribbon width) using
turns/pitch broke outright — the quad connecting a turn's start to its end lands at the SAME angle
one revolution later, rendering as a large flat plane slicing through the helix instead of tracking
the ribbon's actual curve. Render-resolution granularity is small enough for the flat-quad
approximation to track the surface, and is itself a legitimate fabrication unit for a helical
ribbon/stair stringer (small flat segments are how one would actually be built from stock).

**Panel subdivision.** By default every named profile edge is measured as one panel spanning its
full width, which reads as a large number on a wide building face — not because the math is wrong,
but because no real curtain wall actually clads a whole ~75ft face as a single flat sheet.
`subdivideProfileForPanels(profile, n, closed, subPerEdge)` interpolates `subPerEdge` additional
points along each straight edge of the flat, *undeformed* profile before `layerPointFn` deforms
them, reproducing what a finer real-world panelization scheme would look like at whatever bay count
the user picks (`state.panelSubdiv`, slider range 1–12). `subPerEdge <= 1` is a verified true
no-op — returns the original `profile`/`n` unchanged (identity, not just numerically equal) — so
default behavior is untouched. Warp scales roughly linearly with panel width for a given rotation
rate (verified against the Turning Torso case study: 23m/1 panel → 26.2in, 11.5m/2 panels →
13.2in, ... 2.3m/10 panels → 2.6in). The sidebar shows a live "~X wide panels" readout computed
from the actual first panel's edge length every rebuild, so the real-world bay size behind whatever
N is chosen is never left to guesswork.

**Rendering.** Each panel renders as two triangles with matching per-vertex colors from
`warpColor()` — a green (`0x2f9e44`) → amber (`0xf2c14e`) → red (`0xc0392b`) gradient over an
illustrative 0–50mm range — nudged outward from each panel's own centroid by 3%, the same technique
slice rings and floor lines use to avoid z-fighting with the coincident solid surface. A second,
slightly-further-out (4.5%) `LineSegments` outline is drawn around every panel's 4 edges so
subdivided panel boundaries stay visible even when two neighboring panels land at similar enough
warp to get near-identical fill colors — without it, a finely subdivided face reads as one
undifferentiated wash of color instead of N distinct panels. The solid itself (`sideMesh` and both
caps) sets `.visible = false` while the overlay is on, rather than being skipped from `solidGroup`
entirely — `Box3.setFromObject()` (which `frameCameraDefault()` uses) traverses regardless of
`.visible`, so camera framing is unaffected by the solid being hidden, but real coincident geometry
that could z-fight with the panel quads is gone.

**In-canvas legend.** A bottom-left viewport panel (visible only while the overlay is on) shows the
same gradient with 0/25mm/50mm+ tick labels (or the inch equivalents in Imperial, via
`toDisplaySmallLen`/`smallLenUnit`, the same conversion the HUD row uses) plus a marker positioned
at `min(maxWarpMM/50, 1) × 100%` along the bar and an explicit "actual max" reading — since the
gradient itself clamps at 50mm (every panel past that renders identically red), the marker and
reading are what actually distinguish a model at 51mm from one at 200mm, which the color alone
cannot.

**Verification.** Checked headlessly before shipping against several known cases: a straight prism
and pure Shear both measure exactly zero warp (Shear is an affine map, which preserves planarity of
any originally-flat panel — matches the book's own claim). A rectangular cross-section under Taper
measures exactly zero warp on every panel even when `V ≠ W`, because each of its edges holds one
local coordinate constant, leaving no bilinear cross-term for that edge to warp with; a Triangle
preset under the same asymmetric Taper does warp on its non-axis-aligned edges, as expected. Twist
warps heavily and grows with `α_max`, as expected for a helicoid.

One finding surfaced during verification, not anticipated going in: **Bend's panels measure exactly
flat (to floating-point precision) at every angle and cross-section tried** — a genuinely different
result from Twist despite both being volume-preserving, rigid-per-slice operations. The reason is
structural: Bend's `computeLayerPoint` passes the profile's local x-coordinate straight through
unchanged (`worldX = p[0]`) and only ever rotates/translates the local radial coordinate `p[1]`
within the plane normal to the bend arc — the local bend-axis direction itself is never rotated.
That makes Bend, mechanically, a cylindrical bend of a flat sheet (a developable surface) rather
than a twist, and developable surfaces are exactly the ones that can be unrolled flat without
stretching — flat floor-to-floor panels are a direct consequence, not a coincidence. Twist, by
contrast, rotates both local coordinates together, mixing them across height and producing a real
helicoid, which is why its panels warp. This is now called out directly in Bend's Reference panel
text as something to check with the overlay.

## Camera framing

`fitBoxDistance()` fits an actual Three.js `Box3` computed from the rendered solid, returning its
center and circumscribed-sphere radius. `Box3.setFromObject()` traverses every descendant of
`solidGroup` regardless of `.visible`, so this stays correct even while Panel flatness (warp) hides
the solid mesh itself (see above).

**Perspective vs Orthographic (v1.38.0).** Two camera objects, `perspCamera` and `orthoCamera`, with
`camera` a plain variable pointing at whichever is active — read at call-time everywhere in the
codebase (raycasting, the render loop, `getWorldDirection`), so nothing else needs to know which
type is current. `positionCameraForFit(camDir, target, radius)` is the one function that actually
knows the difference: for perspective, it derives a fit *distance* from FOV math (checked against
both horizontal and vertical FOV, whichever is more restrictive, with 15% padding — this is the
same math `fitBoxDistance()` used to do directly before the refactor). For orthographic, distance
is nearly irrelevant to apparent size — an orthographic camera's on-screen size comes from its
*frustum* (`left`/`right`/`top`/`bottom`), not how far away it sits — so instead it sets
`orthoBaseHalfHeight = radius * 1.15` (the same 15% pad, just applied to a frustum half-height
instead of a distance), resets `camera.zoom = 1`, and calls `applyOrthoFrustum()` to fold in the
current aspect ratio (`OrthographicCamera` has no `.aspect` property the way `PerspectiveCamera`
does — the aspect has to be multiplied into the frustum half-width by hand). `dist` is still set for
the orthographic branch (`radius * 3`, arbitrary) purely to give the camera a real position for
`near`/`far` clipping and a sensible `OrbitControls` orbit radius — it has no effect on how big the
model appears, unlike the perspective branch where distance is the *entire* mechanism.

Verified this boundary is exact, not just "looks about right": built the real view-projection
matrix from an `OrthographicCamera` positioned by this exact function (installed `three@0.128.0`
standalone in Node, outside the app, to test against the actual library rather than a
reimplementation) and projected two points along the padded radius — one at 99% (must be inside the
`[-1,1]` NDC clip volume) and one at 100.1% (must fall just outside). Both landed exactly where the
15% pad predicts, in both directions.

`resize()` updates *both* cameras' projections on every resize regardless of which is active
(`perspCamera.aspect` + `updateProjectionMatrix()`; `applyOrthoFrustum()` + `updateProjectionMatrix()`
for the ortho camera), so switching projection mid-session never hits a stale frustum sized for an
old window dimension.

**Switching projection.** `switchProjection(newProjection)` does not attempt to convert the old
camera's distance into an equivalent zoom/frustum for the new one — there's no exact conversion
between "how far away" (perspective's mechanism) and "how wide a frustum" (orthographic's), so
trying would only be an approximation. Instead it captures the *current view direction* (via
`camera.getWorldDirection()`, negated to get the camera-from-target direction) and the current
`controls.target`, swaps which camera `camera` points to, disposes and recreates `OrbitControls`
pointed at the new camera (camera swap-in-place on an existing `OrbitControls` instance isn't
reliably supported across versions, so a fresh instance is the safe choice), and calls
`positionCameraForFit()` fresh with the preserved direction and target. Net effect: switching
changes only how depth is projected — never reorients the view, never resets pan — because the
direction and target it re-fits from are exactly what the user was already looking at and from.

`frameCameraDefault()` (Home), `frameCameraTop()`, and `frameCameraFront()` all call
`positionCameraForFit()` and only differ in which axis they position the camera along and which way
`up` points — Top swaps `up` to a horizontal axis and gives the fit direction a sub-millimeter
horizontal epsilon (`(0.001, 1, 0.001)` normalized, rather than perfectly vertical `(0,1,0)`) —
both standard workarounds for a known OrbitControls singularity when the camera-to-target vector
aligns exactly with `up`). This wasn't always true: Top and Front originally used an older,
separate height-only heuristic (`dist = h × a fixed multiplier`, no bounding box involved) that
predated `fitBoxDistance()` and was never upgraded to match it — harmless for a roughly
cube-proportioned model, but for a tall/narrow real building (The Shard: 1015.7ft tall, 91.9ft
footprint) the old Front distance (~232m) fell well short of what's actually needed to fit the full
height within the vertical FOV (~400m+), let alone with any padding — the tower filled the
viewport nearly edge-to-edge vertically with no margin while leaving most of the width empty,
which looked like a coincidental near-fit rather than an actual one. Fixed in v1.31.0 by having all
three share `fitBoxDistance()`, so "zoom to fit, centered" now means the same thing for every view
button regardless of the model's proportions.

Runs on the very first `rebuild()` after boot, again whenever Home/Top/Front is clicked, and again
whenever `pendingReframe` is true at the start of a `rebuild()` — a flag set by the button handlers
for Operation, cross-section preset, Helix generator, a case study, and Reset values, all of which
can change the model's size/shape/position drastically enough that the previous camera position
would frame empty space or a sliver of the new model. Ordinary slider `input` events (fired
continuously during a drag) do NOT set it, so live-dragging a parameter never disturbs mid-session
zoom/orbit — the same principle the original one-shot `hasFramedOnce` guard was protecting,
generalized from "only the very first build" to "any actual reframe-worthy change," after real
button-triggered framing failures (Helix nearly invisible after switching modes; Bend's base plane
filling the viewport) showed the one-shot version wasn't enough.

v1.34.0 added one more source: every slider that can change the model's actual size or shape
(floors, floor height, footprint width/depth, every deformation parameter, every Helix dimension —
everything except resolution, loft profile count, and panel subdivision, which are purely visual
density controls) also sets `pendingReframe` on its `change` event. `change` fires once when a
slider is released, unlike `input`, which fires continuously during the drag — so this doesn't
touch the live-drag experience at all (the camera still never moves while dragging), but a drastic
change (floors 8 → 100, say) now properly re-fits once the user lets go, instead of leaving the
model stranded outside the frame with no recovery short of manually clicking Home. The same
`pendingReframe = true` is set from the click-to-type editable value fields' commit handler too,
for typed values, with the same resolution exception.

**Near/far clipping planes.** Home/Top/Front each set an initial `camera.near`/`camera.far` sized
for their own fit distance, but those are no longer the last word — `animate()` recomputes both
every frame from the camera's actual live distance to `controls.target`, using `lastModelRadius`
(a Box3-derived radius cached once per `rebuild()`, not recomputed every frame) as a buffer beyond
that distance. This exists because OrbitControls has no `maxDistance` set — scrolling to manually
zoom out is technically unbounded — but a *static* far plane sized only for the distance at the
moment a view button was last clicked would eventually get exceeded by further manual zoom-out,
clipping the model out of view entirely. That reads exactly like being capped (the camera can
still move back, there's just nothing left to render), which is what a user report/screenshot on a
1350ft-tall case study caught (v1.33.0). Recomputing every frame instead of only on a reframe means
near/far stay correct at any zoom level the user reaches by scrolling, not just the one the last
Home/Top/Front click happened to compute.

## Overlay decoration sizing

Point-label size, the axis arrowhead cone, the origin marker, the surface-normals overlay length,
and FFD handle radius are all sized off a single `footprintExtent` value — the (x,z) bounding
extent of the model's BASE ring only (the first `n` points of `layerPositions`, i.e. one layer, not
the whole solid), computed once per `rebuild()`. Earlier versions sized these off total model
height `h` instead, which works fine for a roughly cube-proportioned model but breaks down for a
tall, narrow real-building case study — The Shard (309.6m tall, ~28m footprint) made 10
h-proportional point labels arranged around a 28m-wide base each read ~14m wide, guaranteeing
overlap regardless of camera framing. `footprintExtent` fixes this by tracking the dimension these
decorations are actually meant to read against (the footprint they're marking), not the one that
happens to be largest for a tall building.

Base plane B is sized from `footprintExtent` too, but has its own related history: an earlier
version derived its equivalent value from the planar bounding extent of *every* layer in
`layerPositions`, not just the base ring — correct for a mode that stays above its own footprint
(Twist, Taper), but wrong for one that sweeps sideways through world space as it curves (Bend
especially, whose solid can span a wide arc): the "base plane" was measuring the whole curved
solid's footprint, not the actual base cross-section, producing a base plane many times larger than
the building actually sitting on it.

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

## Shareable URL

"Copy share link" (Export section) round-trips the entire `state` object — mode, preset, every
deformation parameter, footprint size, floors/floor-height, units, projection, resolution,
panel-subdivision/tolerance-target, every overlay toggle, and FFD control-point offsets — through
`JSON.stringify` → `btoa` → a URL-safe base64 alphabet (`+`/`/` swapped for `-`/`_`, `=` padding
dropped since the decoder reconstructs it from length), stored in the location **hash**
(`#s=<encoded>`), not a query string.

The hash choice is deliberate: a hash is never sent to a server (not in the HTTP request line, not
in any access log Netlify or anything else keeps), which is the right property for a fully
client-side static app with no backend to receive a query param anyway. It also means the encoded
state is genuinely invisible to anything but the browser itself.

On load, `applySharedStateFromURL()` parses `#s=...` and merges it into `state` — using the same
nested-overlay `Object.assign` pattern the existing localStorage restore already used, so a link
that only changes (say) `mode` and `alphaMax` doesn't blow away the rest of the recipient's overlay
toggles. This runs *after* the localStorage restore, so a shared link always wins over whatever the
recipient's own browser had saved locally; that's the whole point of sending someone a specific
configuration rather than merely nudging their existing session.

**Camera position/orbit is deliberately not encoded.** `pendingReframe` already defaults to `true`
(see Camera framing above), so the very first `rebuild()` after a URL-loaded state re-fits the
camera exactly the way every Operation/preset/case-study switch already does — "zoom to fit,
centered" on whatever loaded, rather than reproducing the sender's arbitrary orbit angle, which
would be as likely to be a bad view for the recipient as a good one.

Clipboard write uses the async `navigator.clipboard.writeText()` where available, with a
temporary offscreen `<textarea>` + `document.execCommand('copy')` fallback for contexts where the
async API isn't present (e.g. non-HTTPS local preview). Malformed or tampered link text
(`decodeStateFromURLParam` failing to parse) fails closed — returns `null`, silently falling back
to the default/localStorage state — rather than throwing and breaking page load.

Verified headlessly before shipping: encoded a default-state object and a modified/non-default one
(different mode, imperial units, orthographic projection, non-default overlays, non-zero FFD
offsets) through the real encode/decode functions, confirmed byte-for-byte deep-equality after the
round trip, and confirmed the encoded output contains none of base64's non-URL-safe characters
(`+`, `/`, `=`).

## Compound operations

Twist, Taper, and Shear can each be followed by a second operation, chosen from the Compound picker
below the primary operation's own controls. `computeLayerPointCompound(mode, params, y, h, p)` wraps
the existing, unmodified `computeLayerPoint()` — runs the primary transform, and if
`state.compoundMode` is set, feeds the result's `[x, z]` back in at the **same** `y` through a second
call to `computeLayerPoint()` for the secondary mode.

This works because Twist, Taper, and Shear all return `[x, y, z]` with `y` passed straight through
unchanged — rotation, scaling, and translation all happen entirely in the horizontal plane at each
height, never touching the height coordinate itself. That means their output `x`/`z`, fed back in at
the same `y`, is exactly the right input for a second transform. Verified before relying on this: a
compound Twist-then-Taper computation was checked against a manual hand-chained calculation (exact
match) and against boundary conditions (`y=0` and `y=h` land on the values the math predicts).

**Bend can only ever be the last step in a chain.** Its own formula does not preserve this property —
`worldY`/`worldZ` describe a point on a curved arc in world space, not "how far up the original
straight axis" the point sits anymore, so there's no way to feed Bend's output into a second
axis-based transform using this same `y`-preserving scheme. Free and Helix don't participate in
compounding at all; neither fits the "preserve `y`, transform `x`/`z`" model this relies on. This
constraint is enforced in three separate places, not assumed to hold from any one of them alone:
the wrapper's own runtime check (`mode !== 'bend'` before compounding), the UI (the Compound picker
hides itself and shows an explanatory note whenever the primary Operation is Bend), and the
mode-switch handler (clears `compoundMode` when switching primary to Bend, FFD, or Helix, or to
whatever mode is currently the compound choice).

`computeLayerPoint(` was replaced with `computeLayerPointCompound(` at all 14 of its real call sites
— mesh construction (side + caps, including the finite-difference normal sampling), the panel-warp
overlay, the tolerance solver, the CSV panel-schedule and loft-profiles JSON exporters, and the axis
(`A`/`A₁`) overlay. All of these already funneled through one or two spots in `rebuild()`
(`buildDeformedGeometry`'s internal calls, and `lastBuild.evalPoint`), so switching that shared
plumbing to the compound-aware wrapper made every downstream consumer compound-aware for free —
none of them individually touched or even aware compounding exists.

**Volume** falls back to the same numeric mesh integration (`computeMeshVolume`) FFD already used,
whenever `state.compoundMode` is set — the closed-form formulas (Cavalieri-preserved volume for
Twist/Shear/Bend, the quadratic formula for Taper) were each derived for a single operation, and
chaining genuinely changes the math (Twist then Taper does scale volume, unlike Twist alone) without
a new closed form being worth deriving just for this.

`paramsForMode(mode)` factors out the `{V,W}`/`{DX,DY}`/`{betaMax}`/`{alphaMax}` params-building
logic so the same mapping is used for both the primary operation (in `rebuild()`) and, when
compounding, the secondary one — one mapping instead of two copies that could silently drift apart.
The four compact secondary-parameter sliders in the Compound section write to the exact same `state`
fields their primary counterparts use (`state.alphaMax`, `state.taperV`/`taperW`, `state.shearDXM`/
`shearDYM`, `state.bendBetaMax`) — safe because the picker never allows the same mode to be both
primary and secondary at once, so a compound slider and its primary counterpart are never live for
the same field simultaneously. `syncSliderLabels()` keeps both directions in sync (primary → compound
and compound → primary), since either one can now change a field the other's DOM element doesn't
automatically know about.

Play/Pause still only animates the primary operation's own parameter(s) — a disclosed scope decision,
not a gap. Compare, localStorage persistence, and the shareable URL all pick up `compoundMode`
automatically, since it's just one more field in the same `state` object those already serialize
wholesale.

## Animation

One Play/Pause button (top of Deformation parameters, not duplicated per mode) ping-pongs the current
Operation's own primary parameter(s) between a neutral starting value and whatever's currently dialed
in, using an eased 0→1→0 cycle. It mutates `state` directly each animation frame and restores the
exact pre-animation values on stop, rather than threading a parallel parameter-override path through
`computeLayerPoint`/`buildDeformedGeometry` — those already read straight from `state` everywhere,
and duplicating that plumbing just to avoid a few frames of temporary mutation would have been a much
larger, riskier change to already-verified geometry code. It runs inside the existing `animate()`
rAF loop (not a second one) and calls the very same `rebuild()` that FFD handle dragging already
calls on every single `pointermove` — a full `rebuild()` every animation frame isn't a new class of
per-frame cost this app takes on, just a new source of an already-accepted one.

Free (FFD) has no single scalar parameter to animate — 8 independently-draggable control points
instead — so its own branch scales every offset by the same 0→1 blend factor. Since Free's own
default/Reset state has all 8 offsets at exactly zero, `startAnimation()` checks for at least one
control point with real offset magnitude (>1cm) before starting; with nothing dragged, it shows a
toast and declines rather than flipping to Pause and visibly doing nothing.

Stops automatically on manual slider drag, Operation switch, case-study load, or Reset — each of
those calls `stopAnimation()` from inside its own handler's body (not a second, separately-registered
listener), since a second listener isn't guaranteed to run before the feature's own handler on the
same click, and running after would restore stale pre-switch animation values over whatever the
switch just set.

## Comparison mode

"Save snapshot" (Compare section) clones the current solid as a translucent ghost overlaid on the
live model, rather than a literal second synced viewport — this app's single scene/camera/renderer/
controls stack is referenced directly throughout `rebuild()` and every overlay function, and
duplicating that whole stack for a real side-by-side view would have been a far larger, riskier
restructuring than the feature was worth.

Ghost geometry: temporarily swap `state` to the snapshot's captured values (a deep copy of every key
in `state`, taken at the moment "Save snapshot" is clicked), call the real unmodified `rebuild()`,
clone `solidGroup`'s resulting mesh(es) into a separate `ghostGroup`, swap `state` back to the live
values, and call `rebuild()` again for the live geometry. This reuses the exact same, already-verified
geometry path for the snapshot that the live model uses, at the cost of two `rebuild()` calls once
per "Save snapshot" click — not per frame.

`pendingReframe` is explicitly held `false` during the snapshot's own `rebuild()` call and restored
to its original value before the live one — both calls share that one global flag, and letting the
snapshot's `rebuild()` consume it would frame the camera to the snapshot's bounding box and silently
drop the live model's own pending reframe. `ghostGroup` lives directly in `scene`, not `solidGroup`/
`overlayGroup` — the same reasoning already applied to the graph-paper ground grid: it must survive
`solidGroup` being cleared every `rebuild()`, and must not be swept into either camera-fit function's
`Box3` (both scope to `solidGroup` only).

The comparison delta readout is height-only, not volume or area — a deliberate scope decision, since
what "volume" means differs across modes (Helix reports surface area, not volume; Free measures via
numeric integration) and getting that normalization wrong across every mode combination felt like a
worse outcome than a smaller but honestly-correct comparison. `totalHeightM()` is mode-agnostic and
always correct, so it was the safe thing to build the comparison on.

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

- Bend can only be the last step in a compound chain — nothing can be compounded after it (see
  Compound operations above for why). Free and Helix don't support compounding at all.
- Play/Pause only animates the primary operation's parameter(s); a compound secondary operation's
  own parameters stay at whatever they're currently dialed to during playback.
- Helix's open Line generator can't be exported through the current loft pipeline (no solid
  interior); would need a ruled-surface approach instead. Pipe and Circle are both closed generators
  and export the same way every other closed mode does.
- Free/FFD's caps aren't guaranteed to stay flat under an arbitrary control-point drag (an offset
  corner control point can bend even the "flat" top/bottom), so any code path that assumes flat caps
  for other modes explicitly excludes FFD.
