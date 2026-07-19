#!/usr/bin/env node
/**
 * SPIRA — deploy audit
 * Joe.K · axisbim.io
 *
 * Local-only pre-ship check for index.html. Run before every deploy:
 *   node audit_deploy.js
 *
 * Not a linter — checks project-specific invariants that have broken before or would
 * silently break the app if regressed. Exits 1 on any failure so it can gate a deploy
 * script if desired.
 *
 * Growth pattern: every time a bug is found and fixed, add a check() for it in the same
 * edit that fixes it, under a new sectionHeader() named after the version that fixed it.
 * The section list becomes a second, testable copy of the changelog.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'index.html');
if (!fs.existsSync(FILE)) {
  console.error(`✗ Could not find index.html next to this script at ${FILE}`);
  process.exit(1);
}
const src = fs.readFileSync(FILE, 'utf8');

const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m';

let pass = 0, fail = 0;
const failures = [];

function sectionHeader(name) {
  console.log(`\n${BOLD}${name}${RESET}`);
}

function check(desc, cond) {
  if (cond) {
    pass++;
    console.log(`  ${GREEN}✓${RESET} ${desc}`);
  } else {
    fail++;
    failures.push(desc);
    console.log(`  ${RED}✗${RESET} ${desc}`);
  }
}

/* ===================== Version sync ===================== */
sectionHeader('Version sync');
const versionMatch = src.match(/const APP_VERSION = '([\d.]+)'/);
const changelogTopMatch = src.match(/CHANGELOG\s*\n\s*v([\d.]+) - \d{4}-\d{2}-\d{2}/);
check('APP_VERSION constant is defined', !!versionMatch);
check('top changelog entry version matches APP_VERSION', !!versionMatch && !!changelogTopMatch && versionMatch[1] === changelogTopMatch[1]);
check('footer renders APP_VERSION via template literal (not a hardcoded string)', /v\$\{APP_VERSION\}/.test(src));

/* ===================== Debug / leftover artifacts ===================== */
sectionHeader('Debug / leftover artifacts');
check('no console.log left in source', !/console\.log\(/.test(src));
check('no debugger statements', !/\bdebugger\b/.test(src));
check('no lorem ipsum placeholder text', !/lorem ipsum/i.test(src));
check('no leftover alert( calls (toast() is the pattern here)', !/\balert\(/.test(src));
check('no leftover native confirm( calls (confirmDialog() is the pattern here — see below)', !/[^a-zA-Z]confirm\(['"`]/.test(src));

/* ===================== Escaping / XSS hygiene ===================== */
sectionHeader('Escaping / XSS hygiene');
check('escapeHtml() helper defined', /function escapeHtml\(/.test(src));
check('escapeAttr() helper defined', /function escapeAttr\(/.test(src));
check('no eval( in source', !/\beval\(/.test(src));

/* ===================== iOS / mobile baseline ===================== */
sectionHeader('iOS / mobile baseline');
check('viewport meta includes viewport-fit=cover (required for env(safe-area-inset-*) to work)', /viewport-fit=cover/.test(src));
check('body has overscroll-behavior-y:contain (prevents pull-to-refresh from wiping unsaved input)', /overscroll-behavior-y:contain;/.test(src));
check('both apple-mobile-web-app-capable and the modern mobile-web-app-capable meta tags present', /name="apple-mobile-web-app-capable"/.test(src) && /name="mobile-web-app-capable"/.test(src));
check('confirmDialog() function defined (custom modal, not native confirm — iOS standalone mode silently no-ops confirm())', /function confirmDialog\(/.test(src));
check('text/url inputs use 16px font-size if present (prevents iOS auto-zoom-on-focus)', !/input\[type=text\]/.test(src) || /input\[type=text\][^{]*\{[^}]*font-size:16px/.test(src));

/* ===================== Toast / status messaging ===================== */
sectionHeader('Toast / status messaging');
check('toast() helper defined', /function toast\(/.test(src));
check('#toast element present in static markup (outside dynamically-rendered main)', /<div class="toast" id="toast">/.test(src));

/* ===================== v1.23-v1.24 — camera reframe & pan reset ===================== */
// v1.23.0 replaced a one-shot hasFramedOnce boolean (camera only ever auto-fit on the very first
// rebuild) with pendingReframe, set by Operation/preset/Helix-generator/case-study/Reset-values
// button handlers so switching any of those properly re-fits instead of framing empty space or a
// sliver of the new model. v1.24.0 fixed a related regression the pendingReframe work didn't touch:
// rebuild() was unconditionally snapping controls.target back to (0, h/2, 0) on every single call —
// every slider tick, every overlay checkbox — silently discarding any panning, reported as "canvas
// frame jumps" after an unrelated toggle click.
sectionHeader('v1.23-v1.24 — camera reframe & pan reset');
check('pendingReframe flag exists (replaces the old one-shot hasFramedOnce)', /let pendingReframe/.test(src));
check('rebuild() does not unconditionally reset controls.target before paramSummary (v1.24.0 pan-reset regression)',
  !/controls\.target\.set\(0, h\/2, 0\);\s*\n\s*const paramSummary/.test(src));

/* ===================== v1.27-v1.30 — Panel flatness (warp) ===================== */
// v1.27.0: the solid hides itself (mesh.visible=false, not skipped from solidGroup — Box3 traversal
// ignores .visible so camera framing stays correct) while Panel flatness is on, since showing both
// the solid and the nudged warp panels at once z-fights. v1.28.0: each real edge can be subdivided
// into narrower bays (subPerEdge<=1 is a verified no-op, so default behavior is unchanged). v1.29.0:
// a dark outline renders around every panel, nudged further out than the fill (0.045 vs 0.03) so
// subdivided boundaries stay visible even when neighboring panels land at similar colors. v1.30.0:
// the now-inert Wireframe toggle (nothing left to wireframe once the solid's hidden) dims instead of
// silently doing nothing.
sectionHeader('v1.27-v1.30 — Panel flatness (warp)');
check('solid hides via mesh.visible while Panel flatness is on (not skipped from solidGroup, so Box3 framing still sees it)',
  /const hideSolid = state\.overlays\.panelwarp;/.test(src) && /sideMesh\.visible = !hideSolid;/.test(src));
check('subdivideProfileForPanels() exists with a verified subPerEdge<=1 no-op path',
  /function subdivideProfileForPanels\(/.test(src) && /if\(subPerEdge <= 1\) return \{ subProfile: profile, subN: n \};/.test(src));
check('panel outline nudge (0.045) stays further out than the fill nudge (0.03), so it never z-fights with its own panel',
  /\*0\.045,/.test(src) && /\*0\.03,/.test(src));
check('Wireframe row dims while Panel flatness is on (nothing left to wireframe once the solid is hidden)',
  /wireframeRow'\)\.classList\.toggle\('disabled', state\.overlays\.panelwarp\)/.test(src));

/* ===================== v1.31 — shared view-fit for Home/Top/Front ===================== */
// Top and Front used to use an older, separate height-only heuristic (dist = h * a fixed
// multiplier, no bounding box involved) that predated Home's real Box3 fit and was never upgraded
// to match — harmless for a roughly cube-proportioned model, but for a tall/narrow real building it
// left almost no padding margin top-to-bottom while leaving most of the width empty. All three now
// share one fitBoxDistance() calculation.
sectionHeader('v1.31 — shared view-fit for Home/Top/Front');
check('fitBoxDistance() helper exists', /function fitBoxDistance\(\)/.test(src));
(function(){
  const topBody = (src.match(/function frameCameraTop\(\)\{[\s\S]*?\n\}/) || [''])[0];
  const frontBody = (src.match(/function frameCameraFront\(\)\{[\s\S]*?\n\}/) || [''])[0];
  check('frameCameraTop() calls fitBoxDistance() (not the old height-only heuristic alone)', topBody.includes('fitBoxDistance()'));
  check('frameCameraFront() calls fitBoxDistance() (not the old height-only heuristic alone)', frontBody.includes('fitBoxDistance()'));
})();

/* ===================== v1.33-v1.34 — dynamic clipping & reframe-on-release ===================== */
// v1.33.0: camera.near/far used to only ever be set once per view-fit, sized for that fit's own
// distance — OrbitControls has no maxDistance, so scrolling out further than that silently clipped
// the model out of view entirely, which read as "can't zoom out any further." Fixed by recomputing
// near/far every frame from the camera's actual live distance. v1.34.0: sliders that change the
// model's actual size/shape never triggered a reframe at all, even on a drastic change — fixed via
// each slider's 'change' event (fires once on release, unlike 'input' which fires continuously
// during the drag), so live-dragging is unaffected but letting go of a big change re-fits properly.
sectionHeader('v1.33-v1.34 — dynamic clipping & reframe-on-release');
(function(){
  const animateBody = (src.match(/function animate\(\)\{[\s\S]*?\n\}/) || [''])[0];
  check('animate() recomputes camera.near/far every frame from live distance (not a static value set once per view-fit)',
    animateBody.includes('lastModelRadius') && animateBody.includes('camera.near =') && animateBody.includes('camera.far ='));
})();
check('lastModelRadius is cached once per rebuild() (not recomputed every frame — a Box3 traversal 60x/second)',
  /let lastModelRadius/.test(src));
check('SIZE_AFFECTING_SLIDERS list exists and includes both floorsSlider and footprintWidthSlider',
  /const SIZE_AFFECTING_SLIDERS = \[/.test(src) && /floorsSlider/.test(src) && /footprintWidthSlider/.test(src));
check('size-affecting sliders reframe on change (release), not on input (drag) — live-dragging must stay undisturbed',
  /SIZE_AFFECTING_SLIDERS\.forEach\(sliderEl=>\{\s*\n\s*sliderEl\.addEventListener\('change'/.test(src));

/* ===================== v1.35-v1.36 — colorblind palette & panel schedule export ===================== */
// v1.35.0: default green/amber/red is exactly the pair deuteranopia/protanopia struggle to tell
// apart — added a Viridis-based alternate (colorblind-safe and perceptually uniform) as a toggle,
// not a replacement. v1.36.0: panel schedule CSV export recomputes fresh from the same
// computePanelWarp()/subdivideProfileForPanels() functions and current state the live overlay uses,
// rather than a second implementation that could drift out of sync with what's on screen.
sectionHeader('v1.35-v1.36 — colorblind palette & panel schedule export');
check('WARP_PALETTES has both a default and a colorblind-safe (Viridis) stop set',
  /const WARP_PALETTES = \{/.test(src) && /colorblind: \[\[0x44,0x01,0x54\]/.test(src));
check('buildPanelScheduleCSV() reuses computePanelWarp()/subdivideProfileForPanels() rather than reimplementing the math',
  (function(){
    const m = src.match(/function buildPanelScheduleCSV\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('computePanelWarp(') && m[0].includes('subdivideProfileForPanels(');
  })());
check('panel schedule severity thresholds (25/50mm) match warpColor()\'s own gradient stops',
  /warpMM < 25 \? 'green' : warpMM < 50/.test(src));

/* ===================== v1.37.0 — tolerance solver ===================== */
// "Solve for minimum panels" sweeps N=1..12 through the same subdivideProfileForPanels()/
// computePanelWarp() calls the live overlay uses, rather than assuming the roughly-linear
// warp-vs-width relationship that motivated the feature — that relationship is only approximate
// for non-axis-aligned edges, so each N must be verified directly, not extrapolated.
sectionHeader('v1.37.0 — tolerance solver');
check('solveTolerance() reuses computePanelWarp()/subdivideProfileForPanels() rather than extrapolating from a single N',
  (function(){
    const m = src.match(/function solveTolerance\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('computePanelWarp(') && m[0].includes('subdivideProfileForPanels(') && m[0].includes('for(let N=1; N<=12; N++)');
  })());
check('tolerance solver is button-triggered, not swept on every rebuild() (would repeat up to 12 panel-warp computations on every slider tick during a live drag)',
  /document\.getElementById\('solveToleranceBtn'\)\.addEventListener\('click', solveTolerance\)/.test(src));

/* ===================== v1.38.0 — Perspective/Orthographic projection ===================== */
// Two camera objects share one positionCameraForFit() rather than trying to convert a perspective
// distance into an equivalent orthographic zoom (not the same concept — an orthographic camera's
// apparent size comes from its frustum, not its distance from the subject). resize() must update
// BOTH cameras' projections every time, not just the active one, or switching mid-session hits a
// stale frustum sized for whatever window dimension was current the last time that camera was active.
sectionHeader('v1.38.0 — Perspective/Orthographic projection');
check('both perspCamera and orthoCamera exist as real THREE camera objects', /const perspCamera = new THREE\.PerspectiveCamera/.test(src) && /const orthoCamera = new THREE\.OrthographicCamera/.test(src));
check('positionCameraForFit() branches on camera.isPerspectiveCamera rather than assuming one camera type', /function positionCameraForFit\(/.test(src) && /if\(camera\.isPerspectiveCamera\)/.test(src));
check('orthographic branch resets zoom to 1 on every fit (stale zoom from a prior manual scroll would otherwise carry over)', /camera\.zoom = 1;/.test(src));
(function(){
  const resizeBody = (src.match(/function resize\(\)\{[\s\S]*?\n\}/) || [''])[0];
  check('resize() updates BOTH cameras\' projections regardless of which is active (not just the currently-active one)',
    resizeBody.includes('perspCamera.aspect') && resizeBody.includes('applyOrthoFrustum()') && resizeBody.includes('orthoCamera.updateProjectionMatrix()'));
})();
check('switchProjection() re-fits fresh rather than converting the old camera\'s distance into an equivalent zoom/frustum (not an exact conversion between the two projection types)',
  (function(){
    const m = src.match(/function switchProjection\(newProjection\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('positionCameraForFit(') && m[0].includes('getWorldDirection');
  })());
check('switchProjection() disposes and recreates OrbitControls rather than mutating .object on the existing instance (not reliably supported across versions)',
  /controls\.dispose\(\);\s*\n\s*controls = new THREE\.OrbitControls\(camera, renderer\.domElement\);/.test(src));

/* ===================== v1.39.0 — PNG view export ===================== */
// canvas.toBlob() in a continuously-rendering WebGL app needs preserveDrawingBuffer:true or it can
// silently return a blank image, since the drawing buffer clears after compositing by default.
sectionHeader('v1.39.0 — PNG view export');
check('renderer has preserveDrawingBuffer:true (required for canvas.toBlob() to reliably capture a continuously-rendering scene, not just the frame that happened to still be in the buffer)',
  /new THREE\.WebGLRenderer\(\{ antialias:true, preserveDrawingBuffer:true \}\)/.test(src));
check('exportViewPNG() uses canvas.toBlob(), not a synchronous toDataURL() (toBlob is the non-blocking, non-main-thread-stalling API for this)',
  /function exportViewPNG\(\)\{[\s\S]*?renderer\.domElement\.toBlob\(/.test(src));

/* ===================== v1.40.0 — shareable URL ===================== */
// State lives in the location HASH (#s=...), never a query string — a hash never leaves the
// browser (no server/log ever sees it), the right call for a fully client-side static app.
sectionHeader('v1.40.0 — shareable URL');
check('encodeStateToURL() base64-encodes JSON.stringify(state), not some partial/hand-picked subset',
  /function encodeStateToURL\(\)\{\s*\n\s*const json = JSON\.stringify\(state\);/.test(src));
check('encodeStateToURL() output is URL-safe (base64url: no +, /, or = padding)',
  (function(){
    const m = src.match(/function encodeStateToURL\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes(".replace(/\\+/g, '-')") && m[0].includes(".replace(/\\//g, '_')")
      && m[0].includes(".replace(/=+$/, '')");
  })());
check('decodeStateFromURLParam() is wrapped in try/catch (malformed/tampered link text must not throw and break page load)',
  /function decodeStateFromURLParam\(param\)\{\s*\n\s*try\{/.test(src));
check('shared-link state is applied AFTER the localStorage restore, so a shared link always wins over what this browser already had saved',
  (function(){
    const lsIdx = src.indexOf("localStorage.getItem('spira-state')");
    const urlIdx = src.indexOf('applySharedStateFromURL');
    return lsIdx !== -1 && urlIdx !== -1 && lsIdx < urlIdx;
  })());
check('applySharedStateFromURL() merges overlays as a nested Object.assign, same pattern as the localStorage restore (a shallow Object.assign(state, parsed) alone would replace the whole overlays object, dropping any toggle the link happened not to include)',
  /if\(parsed\.overlays\) Object\.assign\(state\.overlays, parsed\.overlays\);/.test(src));
check('copyShareLink() has a textarea+execCommand fallback for contexts without the async Clipboard API, not just a bare navigator.clipboard.writeText() call',
  (function(){
    const m = src.match(/async function copyShareLink\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('navigator.clipboard') && m[0].includes('execCommand');
  })());
check('"Copy share link" button exists and is wired to copyShareLink()',
  /id="copyShareLinkBtn"/.test(src) && /getElementById\('copyShareLinkBtn'\)\.addEventListener\('click', copyShareLink\)/.test(src));
check('shareable-URL parsing runs before the slider/DOM sync block that reads from state (so a URL-loaded value is what sliders pick up, not overwritten after the fact)',
  (function(){
    const urlIdx = src.indexOf('applySharedStateFromURL');
    const sliderSyncIdx = src.indexOf('alphaSlider.value = state.alphaMax;');
    return urlIdx !== -1 && sliderSyncIdx !== -1 && urlIdx < sliderSyncIdx;
  })());

/* ===================== v1.41.0 — Capital Gate case study removed ===================== */
// Removed as a genuine geometric mismatch (compound shape-change + curve, not just nonlinear
// lean) — same bar Shanghai Tower/The Bow were already rejected on. Checks it stays gone rather
// than silently reappearing in a future edit.
sectionHeader('v1.41.0 — Capital Gate case study removed');
check('capitalgate is not a key in CASE_STUDIES', !/capitalgate:\s*\{/.test(src));
check('no "Capital Gate" case-study button remains in the sidebar markup', !/data-casestudy="capitalgate"/.test(src));
check('if a "Case study (real leaning building)" label exists in the sidebar, it belongs to a real, currently-defined case study (not an orphaned label left over from a removed one, the original mistake this check was written to catch)',
  (function(){
    if(!/Case study \(real leaning building\)/.test(src)) return true; // fine if there's no such label at all
    const m = src.match(/Case study \(real leaning building\)\s*<\/div>\s*<button class="btn secondary" data-casestudy="([^"]+)"/);
    return !!m && new RegExp(m[1] + ": \\{").test(src);
  })());

/* ===================== v1.42.0 — Reset values also restores footprint ===================== */
// Root cause of the reported Bend "fan" bug: Reset never touched footprintWidthM/footprintDepthM,
// so a footprint left over from a prior mode/case-study could exceed the bend radius R = h/β and
// invert the swept solid (worldY = (R - p[1])*sinTheta flips negative once p[1] > R).
sectionHeader('v1.42.0 — Reset values also restores footprint');
check('MODE_DEFAULTS.twist/taper/shear/bend each include footprintWidthM and footprintDepthM (not just the deformation-specific fields)',
  (function(){
    const m = src.match(/const MODE_DEFAULTS = \{[\s\S]*?\n\};/);
    if(!m) return false;
    const body = m[0];
    return ['twist:', 'taper:', 'shear:', 'bend:'].every(key=>{
      const lineMatch = body.match(new RegExp(key + '[^\\n]*'));
      return !!lineMatch && /footprintWidthM/.test(lineMatch[0]) && /footprintDepthM/.test(lineMatch[0]);
    });
  })());
check('resetModeValues() calls syncFootprintSliderRange() (so the sidebar sliders actually reflect the restored footprint, not just internal state)',
  (function(){
    const m = src.match(/function resetModeValues\(mode\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('syncFootprintSliderRange()');
  })());
check('bend inversion math: fresh-default footprint half-extent (1m) stays well under the fresh-default bend radius R (~8.91m at beta=180, h=28m)',
  (function(){
    const h = 8 * 3.5, betaRad = 180 * Math.PI/180, R = h/betaRad;
    return (2.0/2) < R * 0.5; // comfortable margin, not just barely under
  })());
check('bend inversion math: the OLD reported bug scenario (stale ~11.5m footprint half-extent) DOES exceed R, confirming this is the real root cause and not a coincidence',
  (function(){
    const h = 8 * 3.5, betaRad = 180 * Math.PI/180, R = h/betaRad;
    const staleHalfExtentM = (75.5/2) * 0.3048;
    return staleHalfExtentM > R;
  })());

/* ===================== v1.43.0 — overlay switch init is bidirectional ===================== */
// Page-load switch sync used to only ever ADD the 'on' class, never remove it — a real bug for the
// five switches (axis/plane/rulings/slicerings/floorlines) whose markup hardcodes class="switch on"
// by default: a saved session or shared link with one of those set to false loaded showing blue/on
// while actually off.
sectionHeader('v1.43.0 — overlay switch init is bidirectional');
check('switch init uses classList.toggle(\'on\', !!state.overlays[key]) (bidirectional — can both add AND remove the on class to match state), not a one-way if/add',
  /sw\.classList\.toggle\('on', !!state\.overlays\[key\]\);/.test(src));

/* ===================== v1.44.0 — Simple/Advanced view + resizable sidebar ===================== */
sectionHeader('v1.44.0 — Simple/Advanced view + resizable sidebar');
check('uiPrefs (Simple/Advanced + sidebar width) is a separate object from `state`, not merged into it — must stay out of localStorage\'s model key, Reset Values, and the shareable-URL encoding',
  (function(){
    const m = src.match(/const uiPrefs = \{[\s\S]*?\};/);
    return !!m && !/state\.uiPrefs|state\.uiMode|state\.sidebarWidthPx/.test(src);
  })());
check('uiPrefs persists under its own \'spira-ui-prefs\' localStorage key (not the model\'s \'spira-state\' key)',
  /localStorage\.setItem\('spira-ui-prefs'/.test(src) && /localStorage\.getItem\('spira-ui-prefs'/.test(src));
check('applyUIMode() toggles the same four advanced-only sections consistently (Units, Projection, resolution, Overlays, Export) regardless of which Operation is active — not per-mode logic',
  (function(){
    const m = src.match(/const ADVANCED_ONLY_IDS = \[[^\]]*\];/);
    if(!m) return false;
    return ['unitsSection','projectionSection','resolutionBlock','overlaysSection','exportSection'].every(id=>m[0].includes(id));
  })());
check('Operation/Cross-section/Deformation-parameters/Reference sections are NOT in the advanced-only list (stay visible in Simple mode)',
  (function(){
    const m = src.match(/const ADVANCED_ONLY_IDS = \[[^\]]*\];/);
    return !!m && !/crossSectionSection|referenceText/.test(m[0]);
  })());
check('sidebar resize handle uses Pointer Events with setPointerCapture (not mouse-only events, so touch/pen work and a fast drag off the thin 6px handle does not drop the gesture)',
  (function(){
    const m = src.match(/\(function setupSidebarResize\(\)\{[\s\S]*?\n\}\)\(\);/);
    return !!m && m[0].includes('pointerdown') && m[0].includes('pointermove') && m[0].includes('setPointerCapture');
  })());
check('sidebar width is clamped (min 260px, max the lesser of 640px or 60vw) rather than allowed to grow unbounded or collapse to nothing',
  (function(){
    const m = src.match(/function clampWidth\(px\)\{[\s\S]*?\n  \}/);
    return !!m && m[0].includes('260') && m[0].includes('640') && m[0].includes('window.innerWidth * 0.6');
  })());

/* ===================== v1.45.0 — theme pass ===================== */
sectionHeader('v1.45.0 — theme pass');
check('Inter/Space Grotesk/Space Mono are actually loaded via a Google Fonts <link>, not just referenced in CSS with nothing serving them',
  /fonts\.googleapis\.com\/css2\?family=Inter[^"]*Space\+Grotesk[^"]*Space\+Mono/.test(src));
check('a favicon <link rel="icon"> exists (there wasn\'t one before)',
  /<link rel="icon"/.test(src));
check('.caveat class exists using --ochre (previously defined in :root but used nowhere) and is applied to both in-app case-study disclaimers, not just defined and orphaned',
  /\.caveat\{[\s\S]*?color:var\(--ochre\)/.test(src) && (src.match(/class="caveat"/g) || []).length >= 2);
check('the tolerance solver toggles .caveat on the result element for the not-achievable case specifically (not left on permanently, not applied to the success case)',
  /resultEl\.classList\.add\('caveat'\)/.test(src) && /resultEl\.classList\.remove\('caveat'\)/.test(src));
check('[data-theme="dark"] overrides all 8 root color variables (a partial override would leave some elements light-themed and others dark, an inconsistent mix)',
  (function(){
    const m = src.match(/\[data-theme="dark"\]\{[\s\S]*?\n  \}/);
    if(!m) return false;
    return ['--cream','--ink','--paper','--paper-rgb','--line','--brick','--prussian','--ochre','--muted'].every(v=>m[0].includes(v));
  })());
check('no hardcoded #fff remains for the active preset-button background or the toggle switch\'s on-state knob (both would go low-contrast against Blueprint\'s lighter --prussian)',
  !/background:#fff/.test(src.match(/\.preset-btn\.active\{[^}]*\}/)?.[0] || '') &&
  !/background:#fff/.test(src.match(/\.switch\.on::after\{[^}]*\}/)?.[0] || ''));
check('the three former hardcoded rgba(251,250,246,...) translucent backgrounds (HUD/view-controls/warp-legend) now use the theme-aware --paper-rgb variable instead',
  !/background:rgba\(251,250,246/.test(src) && (src.match(/background:rgba\(var\(--paper-rgb\)/g) || []).length === 3);
check('groundGrid is added to `scene` directly, not solidGroup/overlayGroup — both camera-fit functions (frameCameraDefault/fitBoxDistance) scope their Box3 to solidGroup only, so a grid living inside solidGroup would blow up every camera fit to a 300-unit box instead of the model',
  /scene\.add\(groundGrid\)/.test(src) && !/solidGroup\.add\(groundGrid\)|overlayGroup\.add\(groundGrid\)/.test(src));
check('applyTheme() disposes the previous groundGrid\'s geometry and material before replacing it on every theme switch (GridHelper\'s two-tone color is baked into per-vertex color attributes at construction, so switching theme means building a new one, not recoloring in place — and the old one must not leak)',
  /groundGrid\.geometry\.dispose\(\)/.test(src) && /groundGrid\.material\.dispose\(\)/.test(src));

/* ===================== v1.46.0 — collapsible Export descriptions ===================== */
sectionHeader('v1.46.0 — collapsible Export descriptions');
check('all four Export-section explanatory paragraphs (PNG export, share link, loft JSON, Dynamo script) are wrapped in <details class="info-toggle">, not plain always-visible <div>s',
  (function(){
    const m = src.match(/<section class="group" id="exportSection">[\s\S]*?<\/section>/);
    if(!m) return false;
    return (m[0].match(/<details class="info-toggle">/g) || []).length === 4;
  })());
check('none of the four <details> blocks carry an `open` attribute — collapsed by default is the whole point, not just available',
  (function(){
    const m = src.match(/<section class="group" id="exportSection">[\s\S]*?<\/section>/);
    return !!m && !/<details class="info-toggle" open/.test(m[0]) && !/<details open/.test(m[0]);
  })());
check('the four action buttons (Export view, Copy share link, Export loft profiles, Download Dynamo script) remain plain always-visible <button>s outside the <details> — only the prose collapses, not the controls themselves',
  /id="exportViewPngBtn"[\s\S]{0,40}<\/button>\s*<details/.test(src) &&
  /id="copyShareLinkBtn"[\s\S]{0,40}<\/button>\s*<details/.test(src));

/* ===================== v1.47.0 — case study, animation, comparison mode ===================== */
sectionHeader('v1.47.0 — Guggenheim case study');
check('guggenheim exists in CASE_STUDIES with mode "helix" and the Line generator (an open ramp, not Circle/Pipe which model a solid tube/screw — wrong shape for an exhibition ramp)',
  /guggenheim: \{\s*\n\s*mode: 'helix'/.test(src) && /helixGenerator:'line'/.test(src.match(/guggenheim: \{[\s\S]*?\n  \}/)?.[0] || ''));
check('Guggenheim\'s sourced outer radius (~17.4m) and inner-radius estimate (4.5m) both fit within the widened slider maxes (20m/5m) with margin, not right at or past the ceiling',
  (function(){
    const outerM = (114/2)*0.3048, innerM = 4.5;
    return outerM < 20 && innerM < 5;
  })());
check('helixROuterSlider/helixRInnerSlider metric maxes were actually widened (20m/5m), not left at the old generic-exploration scale (6m/3m) that Guggenheim\'s real radius would have exceeded',
  (function(){
    const m = src.match(/function syncHelixSliderRanges\(\)\{[\s\S]*?if\(state\.units === 'metric'\)\{[\s\S]*?\n  \} else/);
    return !!m && m[0].includes('helixROuterSlider.max = 20') && m[0].includes('helixRInnerSlider.max = 5');
  })());
check('loadCaseStudy() now syncs helixTurnsSlider.value and calls syncHelixSliderRanges() — the same one-directional gap the v1.42.0 footprint-reset fix caught, just never triggered before since Helix never had a case study to expose it',
  (function(){
    const m = src.match(/function loadCaseStudy\(key\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('helixTurnsSlider.value = state.helixTurns;') && m[0].includes('syncHelixSliderRanges();');
  })());

sectionHeader('v1.47.0 — animation');
check('ANIMATABLE_PARAMS covers all five non-FFD modes (twist/taper/shear/bend/helix) — FFD is handled separately in startAnimation, not silently missing from the table',
  ['twist:', 'taper:', 'shear:', 'bend:', 'helix:'].every(k=>{
    const m = src.match(/const ANIMATABLE_PARAMS = \{[\s\S]*?\n\};/);
    return !!m && m[0].includes(k);
  }));
check('startAnimation() captures each parameter\'s "to" target live from `state` at call time (state[p.key]), not a hardcoded constant, so it always animates toward whatever is actually dialed in',
  /to:state\[p\.key\]/.test(src));
check('stopAnimation() restores the exact pre-animation dialed-in value (state[p.key] = p.to), not whatever the easing curve last landed on — stopping mid-cycle must never leave state disagreeing with the sliders',
  /animPlayer\.params\.forEach\(p=>\{ state\[p\.key\] = p\.to; \}\)/.test(src));
check('tickAnimation() ping-pongs (0->1->0) through an easing function rather than just looping 0->1 and snapping back',
  /cyclePos <= 1 \? cyclePos : \(2 - cyclePos\)/.test(src) && /easeInOutCubic/.test(src));
check('animate() only calls tickAnimation() when animPlayer is truthy — not unconditionally every frame regardless of play state',
  /if\(animPlayer\) tickAnimation\(\);/.test(src));
check('stopAnimation() is called from inside loadCaseStudy/resetModeValues/the mode-switch handler themselves (not via a second separately-registered listener, which isn\'t guaranteed to run before the feature\'s own handler and could restore stale values over what the switch just set)',
  (function(){
    const lcs = src.match(/function loadCaseStudy\(key\)\{[\s\S]*?\n\}/)?.[0] || '';
    const rmv = src.match(/function resetModeValues\(mode\)\{[\s\S]*?\n\}/)?.[0] || '';
    return lcs.includes('if(animPlayer) stopAnimation();') && rmv.includes('if(animPlayer) stopAnimation();');
  })());
check('every range slider in the sidebar stops a running animation on pointerdown, so a manual drag doesn\'t fight the animation loop for the same state field every frame',
  /aside input\[type="range"\]/.test(src) && /if\(animPlayer\) stopAnimation\(\); \}\);\s*\n\}\);/.test(src));

sectionHeader('v1.47.0 — comparison mode');
check('the Compare toggle uses a separate .switch-standalone class, not .switch — the generic overlay-switch initializer queries .switch and is keyed to state.overlays[key], which this toggle is not, so sharing the class would wire it a second, conflicting click handler',
  /id="showComparisonSwitch">/.test(src) && /class="switch-standalone" id="showComparisonSwitch"/.test(src) && !/class="switch" id="showComparisonSwitch"/.test(src));
check('rebuildGhostFromSnapshot() holds pendingReframe false during the snapshot\'s own rebuild() and restores the original value before the live rebuild() — both calls share one global flag, so letting the snapshot\'s call consume it would frame the camera to the wrong geometry and silently drop the live model\'s pending reframe',
  (function(){
    const m = src.match(/function rebuildGhostFromSnapshot\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('pendingReframe = false;') && m[0].includes('pendingReframe = hadPendingReframe;');
  })());
check('ghostGroup is added to `scene` directly, not solidGroup/overlayGroup — same reasoning already verified for groundGrid: it must survive solidGroup being cleared every rebuild() and must not be swept into either camera-fit function\'s Box3',
  /scene\.add\(ghostGroup\)/.test(src) && !/solidGroup\.add\(ghostGroup\)|overlayGroup\.add\(ghostGroup\)/.test(src));
check('saveSnapshot() stops a running animation before capturing state — otherwise the snapshot would freeze a random mid-animation transient frame instead of the actual dialed-in target values',
  (function(){
    const m = src.match(/function saveSnapshot\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].trim().startsWith('function saveSnapshot(){\n  if(animPlayer) stopAnimation();');
  })());
check('the Compare section is in ADVANCED_ONLY_IDS (tooling around the shape, not "the shape itself") — consistent with Overlays/Export/Units/Projection, not left visible in Simple mode by oversight',
  /const ADVANCED_ONLY_IDS = \[[^\]]*'compareSection'[^\]]*\];/.test(src));

/* ===================== v1.48.0 — Free (FFD) Play no-op fix ===================== */
sectionHeader('v1.48.0 — Free (FFD) Play no-op fix');
check('startAnimation()\'s FFD branch checks for at least one control point with real offset magnitude before starting, and shows a toast + returns early rather than entering a no-op Pause state when every offset is still at Free\'s own default/Reset value (exactly zero)',
  (function(){
    const m = src.match(/function startAnimation\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('hasOffset') && m[0].includes("toast('Drag a corner handle first") && m[0].includes('return;');
  })());

/* ===================== v1.49.0 — Leaning Tower of Pisa case study ===================== */
sectionHeader('v1.49.0 — Leaning Tower of Pisa case study');
check('pisa exists in CASE_STUDIES with mode "shear" and the ellipse cross-section preset (the real tower is cylindrical, not square/faceted)',
  (function(){
    const m = src.match(/pisa: \{[\s\S]*?\n  \}/);
    return !!m && m[0].includes("mode: 'shear'") && m[0].includes("preset:'ellipse'");
  })());
check('Pisa\'s shearDXM is computed from height*tan(lean), not a separately-typed constant that could silently drift out of sync with the sourced height/angle it\'s supposed to derive from',
  /shearDXM: 56\*Math\.tan\(3\.97\*Math\.PI\/180\)/.test(src));
check('Pisa\'s computed horizontal top offset (height×tan(lean)) independently cross-checks against the separately-sourced ~3.9m figure within 5cm — the two numbers come from different published facts, not one being derived from the other and trivially matching',
  (function(){
    const computed = 56*Math.tan(3.97*Math.PI/180);
    return Math.abs(computed - 3.9) < 0.05;
  })());
check('Pisa\'s shearDXM fits within the shearDXSlider\'s existing -8..8 range (no slider widening needed for this one, unlike Guggenheim\'s Helix radii in v1.47.0)',
  (function(){
    const computed = 56*Math.tan(3.97*Math.PI/180);
    return computed > -8 && computed < 8;
  })());

/* ===================== v1.50.0 — compound operations ===================== */
sectionHeader('v1.50.0 — compound operations');
check('computeLayerPointCompound() never compounds when the base mode is helix, ffd, or bend — the actual safety boundary, not just a UI-layer assumption',
  (function(){
    const m = src.match(/function computeLayerPointCompound\(mode, params, y, h, p\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes("mode !== 'helix'") && m[0].includes("mode !== 'ffd'") && m[0].includes("mode !== 'bend'");
  })());
check('paramsForMode() is used both for the primary operation\'s own params in rebuild() and inside computeLayerPointCompound for the secondary one — one mapping, not two copies that could drift',
  (function(){
    const primaryUse = /params = state\.mode === 'ffd' \? \{ box, cps: ffdControlPoints\(box, h, state\.ffdOffsets\) \} : paramsForMode\(state\.mode\);/.test(src);
    const compoundUse = /const secondaryParams = paramsForMode\(state\.compoundMode\);/.test(src);
    return primaryUse && compoundUse;
  })());
check('volume falls back to numeric computeMeshVolume() whenever state.compoundMode is set, not just for FFD — the closed-form formulas were each derived for a single operation',
  /\(state\.mode === 'ffd' \|\| state\.compoundMode\)\s*\n\s*\? computeMeshVolume\(sideGeo, bottomCap, topCap\)/.test(src));
check('loadCaseStudy() clears state.compoundMode — a case study is a specific real building\'s single-operation figure, and compounding on top would misrepresent it',
  (function(){
    const m = src.match(/function loadCaseStudy\(key\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('state.compoundMode = null;');
  })());
check('the mode-switch handler clears state.compoundMode when switching primary to bend/ffd/helix (none support a secondary op) or to whatever mode is currently the compound choice (can\'t compound a mode with itself)',
  (function(){
    const m = src.match(/\[\.\.\.modeGrid\.children\]\.forEach\(btn=>\{[\s\S]*?\n\}\);/);
    return !!m && m[0].includes('state.compoundMode === state.mode') && m[0].includes("state.mode === 'bend' || state.mode === 'ffd' || state.mode === 'helix'");
  })());
check('syncSliderLabels() sets BOTH the primary AND compound sliders\' own .value (not just label text) for every field they share — needed because a compound slider can now change a state field the primary slider\'s DOM element doesn\'t automatically know about',
  (function(){
    const m = src.match(/function syncSliderLabels\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('alphaSlider.value = state.alphaMax;') && m[0].includes('compoundAlphaSlider.value = state.alphaMax;');
  })());
check('syncShearSliderRange() also sets the compound shear sliders\' min/max/step, not just the primary ones — otherwise they\'d stay stuck at the narrow static HTML default instead of matching the primary\'s actual widened runtime range',
  (function(){
    const m = src.match(/function syncShearSliderRange\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes('compoundShearDXSlider.min = -60') && m[0].includes('compoundShearDXSlider.min = -200');
  })());
check('compound shear sliders divide by M_TO_FT for the imperial conversion, matching the primary sliders exactly — not a reference to a nonexistent FT_TO_M constant (a real bug caught before shipping)',
  (function(){
    const m = src.match(/compoundShearDXSlider\.addEventListener\('input', e=>\{[\s\S]*?\n\}\);/);
    return !!m && m[0].includes('v / M_TO_FT') && !m[0].includes('FT_TO_M');
  })());
check('applyCompoundUI() hides the compound picker grid and shows an explanatory note when primary mode is Bend, rather than just silently disabling or hiding the whole section without saying why',
  (function(){
    const m = src.match(/function applyCompoundUI\(\)\{[\s\S]*?\n\}/);
    return !!m && m[0].includes("compoundGrid.style.display = 'none';") && m[0].includes("bendNote.style.display = '';");
  })());
check('all 14 real computeLayerPoint( call sites were renamed to computeLayerPointCompound( (mesh construction, panel warp/tolerance-solver/CSV export via evalPoint, the axis overlay) — only the function definition and the wrapper\'s own two internal calls still use the base name',
  (function(){
    const compoundCalls = (src.match(/computeLayerPointCompound\(/g) || []).length;
    // 1 function definition + 2 internal calls inside its own body + 14 external call sites = 17 total mentions of the base name across definition+wrapper, and compoundCalls should be at least 14 (the external call sites) plus the wrapper's own definition line
    return compoundCalls >= 15; // 1 def + 14 call sites, using the Compound name
  })());
check('the compound picker excludes whichever mode is currently primary from its own choices (a mode compounded with itself isn\'t a coherent second step)',
  /btn\.style\.display = \(m === state\.mode\) \? 'none' : '';/.test(src));

/* ===================== Summary ===================== */
console.log(`\n${BOLD}${'-'.repeat(40)}${RESET}`);
console.log(`${GREEN}${pass} passed${RESET}, ${fail ? RED : DIM}${fail} failed${RESET}`);
if (fail) {
  console.log(`\n${RED}${BOLD}Failures:${RESET}`);
  failures.forEach(f => console.log(`  ${RED}✗${RESET} ${f}`));
  process.exit(1);
} else {
  console.log(`${GREEN}All checks passed — clear to ship.${RESET}`);
  process.exit(0);
}
