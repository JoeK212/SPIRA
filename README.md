SPIRA

An interactive explorer of architectural deformation operations. Three so far:

**Twist** (Fig. 13.3–13.6) — a fixed base plane B, a vertical axis A, and every horizontal slice
rotated by α(z) = (z/h)·α_max. Straight vertical edges become helices; volume is always exactly
preserved (Cavalieri's principle), which the app states directly rather than leaving as an exercise.

**Taper** (Fig. 13.7–13.9) — the same fixed B and A, but each slice is scaled instead of rotated:
independently in x (factor v(z)) and y (factor w(z)), linear from 1 at the base to user-set v, w at
the top. Despite looking linear, it isn't — per Fig. 13.8 a line not parallel or orthogonal to A
maps to a parabola — and unlike twisting, it does *not* preserve volume, which is the deliberate
pedagogical contrast with twist.

**Shear** (Fig. 13.11–13.14) — the odd one out: every other operation fixes the axis A, but shear
moves it. Each slice is translated within its own plane, linear from (0,0) at the base to (Δx,Δy)
at the top, so the axis's image A₁ leans away from the original A (shown as a dashed reference line
alongside the solid A₁). Because translation is an exact isometry, shear is volume-preserving again,
same as twist — the pairing across all three modes is: twist rotates (preserves volume), taper
scales (doesn't), shear translates (preserves volume).

Switch operations from the "Operation" control at the top of the sidebar; cross-section presets,
floors/floor-height, units, resolution, and all overlays are shared between all three.

Height is set as floors × floor-to-floor height rather than an abstract number, with a Metric/
Imperial toggle that converts every readout (length, area, volume) in the HUD. A "floor lines"
overlay shows the actual story lines; a separate "slice rings" overlay shows the computational
resolution the surface is built from.

Single HTML file, no build step, Three.js (r128) via CDN. Deployed via GitHub → Netlify
continuous deployment.

Live: [add your Netlify URL here once deployed]

Joe.K · axisbim.io
