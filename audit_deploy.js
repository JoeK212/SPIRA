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
