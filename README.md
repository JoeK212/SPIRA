SPIRA

An interactive explorer of the architectural twist deformation: a fixed base plane B, a vertical
twist axis A, and every horizontal slice at height z rotated by α(z) = (z/h)·α_max. Built to make
the operation behind buildings like Calatrava's Turning Torso tangible — change the cross-section,
the twist angle, or the floor count and watch the ruled side surface, the ruling-line helices, and
the volume readout respond live. Because the twist rotates each slice without changing its area,
the twisted and untwisted volumes always match exactly (Cavalieri's principle), which the app
states directly rather than leaving as an exercise.

Height is set as floors × floor-to-floor height rather than an abstract number, with a Metric/
Imperial toggle that converts every readout (length, area, volume) in the HUD. A "floor lines"
overlay shows the actual story lines; a separate "slice rings" overlay shows the computational
resolution the twisted surface is built from, so the two ideas — real stories vs. rendering
smoothness — stay visually distinct.

Single HTML file, no build step, Three.js (r128) via CDN. Deployed via GitHub → Netlify
continuous deployment.

Live: [add your Netlify URL here once deployed]

Joe.K · axisbim.io
