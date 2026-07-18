SPIRA

An interactive explorer of architectural deformation operations. Four so far:

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

That gives a clean pattern across all four: twist rotates, taper scales, shear translates, bend
does both — and exactly the two that scale-free (twist, shear, bend) preserve volume, while the one
that scales (taper) doesn't.

Switch operations from the "Operation" control at the top of the sidebar; cross-section presets,
floors/floor-height, units, resolution, and all overlays are shared between all four.

Height is set as floors × floor-to-floor height rather than an abstract number, with a Metric/
Imperial toggle that converts every readout (length, area, volume) in the HUD. A "floor lines"
overlay shows the actual story lines; a separate "slice rings" overlay shows the computational
resolution the surface is built from.

Single HTML file, no build step, Three.js (r128) via CDN. Deployed via GitHub → Netlify
continuous deployment.

Live: [add your Netlify URL here once deployed]

Joe.K · axisbim.io
