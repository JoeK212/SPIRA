SPIRA

An interactive explorer of architectural deformation operations. Six so far:

**Twist** (Fig. 13.3–13.6) — a fixed base plane B, a vertical axis A, and every horizontal slice
rotated by α(z) = (z/h)·α_max. Straight vertical edges become helices; volume is always exactly
preserved (Cavalieri's principle), which the app states directly rather than leaving as an exercise.

**Taper** (Fig. 13.7–13.9) — the same fixed B and A, but each slice is scaled instead of rotated:
independently in x (factor v(z)) and y (factor w(z)), linear from 1 at the base to user-set v, w at
the top. Despite looking linear, it isn't — per Fig. 13.8 a line not parallel or orthogonal to A
maps to a parabola — and unlike twisting, it does *not* preserve volume, which is the deliberate
pedagogical contrast with twist.

**Shear** (Fig. 13.11–13.14) — the first of two operations where the axis A doesn't stay fixed.
Each slice is translated within its own plane, linear from (0,0) at the base to (Δx,Δy) at the top,
so the axis's image A₁ leans away from the original A (shown as a dashed reference line alongside
the solid A₁). Translation is an exact isometry, so shear preserves volume, same as twist.

**Bend** (Fig. 13.15–13.16) — the axis A maps to a circular arc A₁ of radius R = h/β, chosen so the
arc length exactly equals the original axis length h. Each slice is rearranged into the plane normal
to that arc, with the profile's local x carried straight through. Like shear, the axis moves — A₁
is drawn as a sampled curve rather than a straight line — and like twist and shear, bending only
rotates and translates each slice (never scales it), so it's volume-preserving too.

**Free** (Fig. 13.17–13.20) — freeform deformation, and the odd one out architecturally: no axis,
no fixed base plane. The whole solid sits inside a cuboid with 8 control points at its corners, and
every point inside is a trilinear (1,1,1) Bézier blend of all 8 — drag any of the brick handles
directly in the viewport to see it live. There's no Cavalieri argument here; an arbitrary trilinear
warp can do anything to volume, so this is the one mode where the volume readout is measured from
the actual mesh (numeric integration) rather than computed from a formula.

**Helix** (Fig. 9.53–9.60) — a genuinely different construction from the other five, and from a
different chapter of the book (ch.9, "Helical Surfaces," rather than ch.13's solid deformations).
Instead of extruding a cross-section and deforming each slice, a generator/meridian curve is swept
by true helical motion: rotate by u about axis A while translating p·u along it
(x=X(v)cosu, z=X(v)sinu, y=Y(v)+p·u). Two generator types: **Line** is the common/right helicoid
(Fig. 9.56–9.57) — a straight segment orthogonal to A, producing the classic open spiral ramp or
staircase surface (Fig. 9.60's photo), with adjustable inner radius (a central void) and outer
radius. **Circle** places a circle flat in the meridian plane (Fig. 9.55, middle) — a winding
tube/screw-column, capped at both open ends. (The book's third variant, Fig. 9.55 bottom — a circle
held orthogonal to the helix's own tangent, the "true" constant-radius pipe — needs a moving Frenet
frame along the 3D helix and isn't implemented; noted in the in-app reference text rather than
silently skipped.) A helicoid isn't a solid — the common one has a hole around the axis and zero
thickness — so there's no volume to preserve; the HUD instead reports surface area (also measured,
same as Free, since no closed form exists here either) and generator length. Height is turns × pitch
(rise per revolution) rather than floors × floor-height, so this mode swaps in its own Turns/Pitch
controls, and reuses the "Floor lines" overlay as "Turn lines." Ruling lines, slice rings, the fixed
axis A overlay, and point labels all fall out of the shared code paths unmodified, since they only
depend on the returned layer-positions/segs/n shape, not on which builder produced it.

That gives a clean pattern across the first four: twist rotates, taper scales, shear translates,
bend does both — and exactly the three that don't scale (twist, shear, bend) preserve volume, while
the one that does (taper) doesn't. Free sits outside that pattern entirely, on purpose. Helix sits
outside it even further — it isn't deforming a solid at all, but sweeping a surface.

Switch operations from the "Operation" control at the top of the sidebar; cross-section presets,
floors/floor-height, units, resolution, and most overlays are shared across the first five — Helix
swaps the cross-section and floors/floor-height controls for its own generator and turns/pitch
controls, since it doesn't use a footprint or floors.

Height is set as floors × floor-to-floor height rather than an abstract number (or, in Helix, as
turns × pitch), with a Metric/Imperial toggle that converts every readout (length, area, volume) in
the HUD. A "floor lines" overlay shows the actual story lines (or, in Helix, turn boundaries); a
separate "slice rings" overlay shows the computational resolution the surface is built from.

**Cross-section sizing.** Each preset (square, triangle, hexagon, star) is generated at its own
arbitrary proportions internally, then scaled — independently in width (x) and depth (z) — to real
Width/Depth sliders in the Cross-section panel, so any preset can be sized in actual meters or feet
instead of whatever proportions it happened to be coded with. Defaults reproduce the original square
exactly.

**Direct value entry.** Every slider's readout is also a click-to-type field: click it, type a
number, Enter or blur commits, Escape cancels. Length fields (shear offsets, floor height, all Helix
dimensions, footprint width/depth) accept feet-inches notation in imperial mode — `8'-6"`, `8' 6"`,
`8ft 6in` — since that's how architects actually write dimensions.

**Reset values.** Every operation has a "Reset values" button restoring that mode's own parameters
(and floors/floor-height, where relevant) to their original defaults.

**View navigation.** Top (plan), Front (elevation), and Home buttons sit in the bottom-right of the
viewport for standard orthographic-ish framing, alongside the usual orbit/pan/zoom. A small marker
labeled "0,0,0" is always visible at the true world origin when the Axis overlay is on, as a fixed
reference point regardless of view.

Single HTML file, no build step, Three.js (r128) via CDN. Deployed via GitHub → Netlify
continuous deployment.

Live: [add your Netlify URL here once deployed]

Joe.K · axisbim.io
