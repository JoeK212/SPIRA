SPIRA

An interactive explorer of architectural deformation operations. Six so far:

**Twist** — a fixed base plane B, a vertical axis A, and every horizontal slice rotated by
α(z) = (z/h)·α_max. Straight vertical edges become helices; volume is always exactly preserved
(Cavalieri's principle), which the app states directly rather than leaving as an exercise. Two
one-click case studies load real, documented buildings: **Turning Torso** (Calatrava, Malmö, 2005 —
190m, 54 floors, 90° total twist) and **Cayan Tower** (SOM, Dubai, 2013 — 306m, 73 floors, 90° total
twist). Both were picked because they're twist-only — no accompanying taper — so a single Twist
preset actually represents them honestly; height, floor count, and twist angle are sourced, footprint
size is an illustrative estimate (the UI says so).

**Taper** — the same fixed B and A, but each slice is scaled instead of rotated: independently in
x (factor v(z)) and y (factor w(z)), linear from 1 at the base to user-set v, w at the top. Despite
looking linear, it isn't — a line not parallel or orthogonal to A maps to a parabola as it scales —
and unlike twisting, it does *not* preserve volume, which is the deliberate pedagogical contrast
with twist. A case study loads **The Shard** (Renzo Piano, London, 2012 — 309.6m, 95 floors, tapers
to a near-point); height/floors are sourced, but no published base/top footprint ratio was found, so
the taper amount is an illustrative estimate, like every case study's footprint size.

**Shear** — the first of two operations where the axis A doesn't stay fixed. Each slice is
translated within its own plane, linear from (0,0) at the base to (Δx,Δy) at the top, so the axis's
image A₁ leans away from the original A (shown as a dashed reference line alongside the solid A₁).
Translation is an exact isometry, so shear preserves volume, same as twist. A case study loads the
**Leaning Tower of Pisa** (~56m, 8 floors, ~3.97° lean); height, lean angle, floor count, and base
diameter are sourced, and cross-check against each other (height×tan(lean) ≈ the independently
sourced top offset). Capital Gate (Abu Dhabi) was investigated and removed in an earlier version:
its floor plates don't just lean, they change shape and orientation with height, which Shear's
straight-cross-section translation can't represent — Pisa's real deviation (a later corrective
counter-angle) stays within the same operation, unlike Capital Gate's.

**Bend** — the axis A maps to a circular arc A₁ of radius R = h/β, chosen so the arc length exactly
equals the original axis length h. Each slice is rearranged into the plane normal to that arc, with
the profile's local x carried straight through. Like shear, the axis moves — A₁ is drawn as a
sampled curve rather than a straight line — and like twist and shear, bending only rotates and
translates each slice (never scales it), so it's volume-preserving too.

**Free** — freeform deformation, and the odd one out architecturally: no axis, no fixed base plane.
The whole solid sits inside a cuboid with 8 control points at its corners, and every point inside is
a trilinear (1,1,1) Bézier blend of all 8 — drag any of the brick handles directly in the viewport
to see it live. There's no Cavalieri argument here; an arbitrary trilinear warp can do anything to
volume, so this is the one mode where the volume readout is measured from the actual mesh (numeric
integration) rather than computed from a formula.

**Helix** — a genuinely different construction from the other five: instead of extruding a
cross-section and deforming each slice, a generator/meridian curve is swept by true helical motion:
rotate by u about axis A while translating p·u along it (x=X(v)cosu, z=X(v)sinu, y=Y(v)+p·u). Three
generator types: **Line** is the common/right helicoid — a straight segment orthogonal to A,
producing the classic open spiral ramp or staircase surface, with adjustable inner radius (a
central void) and outer radius. **Circle** places a circle flat in the meridian plane — a winding
tube/screw-column, capped at both open ends. **Pipe** rides the same circle along a Frenet frame
(tangent/normal/binormal) computed from the helix centerline itself, so the circle stays exactly
orthogonal to the local tangent at every point — the true constant-radius pipe, as opposed to
Circle's simplified flat-in-the-meridian-plane version, whose apparent cross-section distorts as
pitch steepens relative to radius. A
helicoid isn't a solid — the common one has a hole around the axis and zero thickness — so there's
no volume to preserve; the HUD instead reports surface area (also measured, same as Free, since no
closed form exists here either) and generator length. Height is turns × pitch (rise per revolution)
rather than floors × floor-height, so this mode swaps in its own Turns/Pitch controls, and reuses
the "Floor lines" overlay as "Turn lines." Ruling lines, slice rings, the fixed axis A overlay, and
point labels all fall out of the shared code paths unmodified, since they only depend on the
returned layer-positions/segs/n shape, not on which builder produced it.

That gives a clean pattern across the first four: twist rotates, taper scales, shear translates,
bend does both — and exactly the three that don't scale (twist, shear, bend) preserve volume, while
the one that does (taper) doesn't. Free sits outside that pattern entirely, on purpose. Helix sits
outside it even further — it isn't deforming a solid at all, but sweeping a surface.

**Compound.** Twist, Taper, and Shear can each be followed by a second operation — the Compound
picker below the primary operation's own controls. Works because those three all return a point at
the exact same height they were given (rotation/scaling/translation happen entirely in the
horizontal plane at each level), so the result feeds cleanly into a second transform at that same
height. Bend can only ever be the *last* step in a chain — once the axis itself curves, "how far up
the original straight axis" a point sits no longer means anything a second transform could use, so
nothing can follow it. Free and Helix don't participate in compounding at all. This is what makes a
building like Shanghai Tower (which twists AND tapers) finally representable, after several other
real buildings got rejected as case studies specifically for combining two operations SPIRA could
previously only ever apply one of.

Switch operations from the "Operation" control at the top of the sidebar; cross-section presets,
floors/floor-height, units, resolution, and most overlays are shared across the first five — Helix
swaps the cross-section and floors/floor-height controls for its own generator and turns/pitch
controls, since it doesn't use a footprint or floors.

Height is set as floors × floor-to-floor height rather than an abstract number (or, in Helix, as
turns × pitch), with a Metric/Imperial toggle that converts every readout (length, area, volume) in
the HUD. A "floor lines" overlay shows the actual story lines (or, in Helix, turn boundaries); a
separate "slice rings" overlay shows the computational resolution the surface is built from.

**Panel flatness (warp).** Every operation except pure extrusion produces floor-to-floor,
edge-to-edge panels — the actual quads a fabricator would cut, not the fine render mesh — that
aren't perfectly flat. This overlay color-codes each real panel green (flat) through amber to red
(warped), with a legend in the bottom-left of the viewport (including a marker showing exactly
where the current model's worst panel falls on the scale, and an explicit reading when it's off
the top of the scale entirely), dark outlines around every panel so neighboring bays stay
distinguishable even when their colors are close, and the HUD reports the worst panel's warp in mm
(or inches), using the standard curtain-wall "twist" tolerance measure: the perpendicular distance
of one corner from the plane of the other three. The solid itself hides automatically while this
overlay is on, since the colored panels already cover the same surface and showing both at once
z-fights. The color scale (0–50mm) is illustrative, the same way case-study footprint sizes are —
not a sourced tolerance spec, since real limits vary by system and manufacturer.

By default each named corner-to-corner edge is measured as a single panel, which can read as a
large number on a wide building face — a "subdivide each face into N panels" slider (1–12, shown
alongside the toggle) shows how a real curtain wall would actually reduce that by breaking each
face into narrower bays, since warp scales roughly linearly with panel width for a given rotation
rate; a live readout shows the resulting real-world panel width for whatever N is chosen. A
"Colorblind-safe palette" toggle switches the green/amber/red gradient to Viridis' purple/teal/
yellow stops, which read correctly by brightness alone rather than relying on distinguishing red
from green. "Export panel schedule (.csv)" exports one row per panel currently being analyzed —
width, warp, a severity label matching the on-screen color, and all 4 corner coordinates in the
same Z-up convention the loft-profiles export uses — recomputed fresh from the current
floors/subdivision, so it always matches what's on screen. "Solve for minimum panels" is the
inverse of the subdivision slider: set a target max warp and click Solve for the smallest
per-face panel count that meets it (or an honest "not achievable" if 12 panels isn't enough),
with a one-click Apply.

Comparing Twist against Bend with this overlay on is a good demonstration: Bend's panels come out
exactly flat at any angle, since it only sweeps the cross-section along an arc without ever
rotating the local bend-axis direction (a true cylindrical bend of a flat sheet), while Twist warps
every non-degenerate panel.

**Cross-section sizing.** Each preset (square, triangle, hexagon, octagon, ellipse, star) is
generated at its own arbitrary proportions internally, then scaled — independently in width (x) and
depth (z) — to real Width/Depth sliders in the Cross-section panel, so any preset can be sized in
actual meters or feet instead of whatever proportions it happened to be coded with. Defaults
reproduce the original square exactly. Every preset except Ellipse is a straight-edge polygon with
real corners, rendered as private, sharp-cornered panels between each pair of corners; Ellipse has
no real corners anywhere around its loop, so it's rendered instead with one shared, fully smooth
normal field around the whole cross-section — the same distinction Helix's Circle/Pipe generator
needed against its own Line generator.

**Direct value entry.** Every slider's readout is also a click-to-type field: click it, type a
number, Enter or blur commits, Escape cancels. Length fields (shear offsets, floor height, all Helix
dimensions, footprint width/depth) accept feet-inches notation in imperial mode — `8'-6"`, `8' 6"`,
`8ft 6in` — since that's how architects actually write dimensions.

**Reset values.** Every operation has a "Reset values" button restoring that mode's own parameters
(and floors/floor-height, where relevant) to their original defaults.

**View navigation.** Top (plan), Front (elevation), and Home buttons sit in the bottom-right of the
viewport for standard architectural framing, alongside the usual orbit/pan/zoom — all three zoom to
fit the actual model, centered, regardless of how tall/narrow or wide/short it is, and Home re-fits
to whatever's currently on screen. A small marker labeled "0,0,0" is always visible at the true
world origin when the Axis overlay is on, as a fixed reference point regardless of view.

**Projection.** A Perspective/Orthographic toggle switches between camera-like foreshortening
(the default) and a true parallel projection with none — the standard for architectural plan and
elevation drawings, where sizes need to read accurately regardless of depth rather than appearing
smaller the farther they are from the camera. Applies everywhere (Home, Top, Front, and free orbit
alike), and switching preserves the current view direction and target — only how depth projects
changes, never the view itself.

**Help.** The "?" button in the header opens usage documentation for the app's own controls —
separate from the Reference panel below, which explains the math behind each operation.

**Export.** "Export view (.png)" captures the 3D view exactly as shown — camera angle, projection,
the solid, and every overlay drawn inside the scene itself. The sidebar HUD and the panel-warp
legend are separate page elements, not part of the 3D view, so they aren't included.

"Copy share link" encodes the entire current configuration — mode, preset, every deformation
parameter, footprint, floors, units, projection, resolution, and overlay settings — into a URL
(stored in the location hash, never sent to any server) that reproduces the same setup exactly for
anyone who opens it. A shared link always overrides whatever the recipient's browser had saved
locally. Camera position isn't part of the link — the model re-fits to view on load the same way
switching Operations already does.

"Export loft profiles (.json)" exports N evenly spaced cross-section profiles up the
height, meant for the bundled Dynamo script ("Download Dynamo import script") to consume — it
builds the current form as native Revit geometry (via `GeometryCreationUtilities.CreateLoftGeometry`)
rather than a flat-faceted approximation, so a curved operation like Twist or Bend comes in as one
genuine curved, pickable face per side. Run the script with a Conceptual Mass family document
active for a real, loadable Mass Family, or with a project active for a one-off element. See
`EXTENDED.md` for the full pipeline.

**Sidebar: Simple/Advanced, theme, &amp; resizing.** The View toggle at the top switches between
Simple (Operation, Cross-section, Deformation parameters, Reference — just the shape) and Advanced
(adds Units, Projection, resolution, Overlays, Compare, and Export) — the same sections hide or show
no matter which Operation is active. A second toggle switches between the default paper theme and a
dark "Blueprint" theme (pale linework on deep blue, after the architectural-drawing convention). Drag
the handle at the sidebar's left edge to resize it. All three choices are remembered for next time,
kept separate from the model itself so they're not swept into "Copy share link" or reset by Reset
Values.

**Play / Pause.** Animates the current Operation's own deformation parameter(s) between a neutral
starting value and whatever's currently dialed in, looping back and forth. Dragging any slider,
switching Operation, loading a case study, or Reset all stop it automatically.

**Compare (Advanced view).** "Save snapshot" freezes the current shape as a translucent reference
ghost overlaid on the live model — change any parameter, even switch Operation entirely, and see
exactly how the new shape differs in the same view. The snapshot lives only in the current session.

Single HTML file, no build step, Three.js (r128) via CDN. Deployed via GitHub → Netlify
continuous deployment.

Live: [add your Netlify URL here once deployed]

Joe.K · axisbim.io
