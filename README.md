SPIRA

An interactive explorer of architectural deformation operations. Two so far:

**Twist** (Fig. 13.3–13.6) — a fixed base plane B, a vertical axis A, and every horizontal slice
rotated by α(z) = (z/h)·α_max. Straight vertical edges become helices; volume is always exactly
preserved (Cavalieri's principle), which the app states directly rather than leaving as an exercise.

**Taper** (Fig. 13.7–13.9) — the same fixed B and A, but each slice is scaled instead of rotated:
independently in x (factor v(z)) and y (factor w(z)), linear from 1 at the base to user-set v, w at
the top. Despite looking linear, it isn't — per Fig. 13.8 a line not parallel or orthogonal to A
maps to a parabola — and unlike twisting, it does *not* preserve volume, which is the deliberate
pedagogical contrast between the two modes.

Switch operations from the "Operation" control at the top of the sidebar; cross-section presets,
floors/floor-height, units, resolution, and all overlays are shared between both.

Height is set as floors × floor-to-floor height rather than an abstract number, with a Metric/
Imperial toggle that converts every readout (length, area, volume) in the HUD. A "floor lines"
overlay shows the actual story lines; a separate "slice rings" overlay shows the computational
resolution the surface is built from.

Single HTML file, no build step, Three.js (r128) via CDN. Deployed via GitHub → Netlify
continuous deployment.

Live: [add your Netlify URL here once deployed]

Joe.K · axisbim.io
