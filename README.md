SPIRA

An interactive explorer of architectural deformation operations, built as a companion to
*Architectural Geometry* (Pottmann et al.) for architecture students. Pick an operation, drag a
slider, watch the math play out live — volume, surface area, and panel flatness all update in
real time. Full technical detail (the math per operation, architecture, export pipeline,
verification methodology) lives in `EXTENDED.md`; this is the quick tour.

**Seven operations**, switched from the Operation control at the top of the sidebar:

- **Twist** — each slice rotates by α(z)=(z/h)·α_max. Volume-preserving (Cavalieri's principle).
  Case studies: Turning Torso, Cayan Tower.
- **Taper** — each slice scales independently in x/y. Not volume-preserving — the deliberate
  contrast with Twist. Case study: The Shard.
- **Shear** — each slice translates linearly; the axis itself leans. Volume-preserving. Case
  study: Leaning Tower of Pisa.
- **Bend** — the axis curves into a circular arc. Volume-preserving, and the only operation whose
  panels come out perfectly flat at any angle (a true cylindrical bend).
- **Free (FFD)** — an 8-point control cage, dragged directly in the viewport. No formula for
  volume; measured off the actual mesh.
- **Helix** — sweeps a generator (Line/Circle/Pipe) by true helical motion instead of deforming a
  solid. Reports surface area, not volume. Case study: Guggenheim NYC.
- **Morph** — blends between two *different* cross-section shapes (a topology change, not a
  transform of one shape) — lerped per point, per height. No closed-form volume. Case study:
  Lotte Super Tower.

**Compound** chains a second operation after the first (e.g. Twist then Bend). Works for any
primary that returns a point at the same height it was given (Twist/Taper/Shear/Morph); Bend can
only ever be the *last* step; Free and Helix don't compound.

**Also included:**
- Real-unit floors × floor-height (or turns × pitch for Helix), Metric/Imperial, click-to-type
  sliders with feet-inches notation
- **Panel flatness (warp)** overlay — color-codes actual fabrication panels green→amber→red,
  colorblind-safe palette option, panel-subdivision slider, "solve for minimum panels," CSV export
- Play/Pause animation, Compare/snapshot mode, Perspective/Orthographic toggle, Simple/Advanced +
  Light/Blueprint themes, shareable-URL config export
- **Export pipeline** — PNG, panel-schedule CSV, loft-profiles JSON, and a bundled Dynamo/Revit
  Python script that builds real curved Mass geometry (not flat-faceted) in Revit
- **Teaching content** — a glossary (click any underlined term), 5 self-checking exercises, and a
  guided tour of the UI (opens automatically; also available anytime from the header)

Single HTML file, no build step, Three.js (r128) via CDN. Deployed via GitHub → Netlify
continuous deployment.

Live: https://spiraformdeform.netlify.app/

Joe.K · axisbim.io
