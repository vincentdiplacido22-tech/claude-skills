// Fig: how an NVIDIA GPU runs a warp. A gang press: one ram (the warp scheduler issuing
// one instruction) drives one crosshead carrying 32 punches (the 32 lanes of a warp).
// Each tray is one warp's data, 32 cells. A divergent branch runs as two strokes with
// the lanes that did not take that path pulled up out of the way.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 640;
const HEIGHT = 420;

// ---- the model (H100 SXM5, Hopper) -------------------------------------------------
const LANES = 32; // threads per warp
const SMS = 132; // streaming multiprocessors
const SCHEDULERS = 4; // warp schedulers per SM, each feeding 32 FP32 lanes
const CLOCK = 1.98e9; // boost clock, Hz
const FP32_LANES = SMS * SCHEDULERS * LANES; // 16,896
const TFLOPS = (FP32_LANES * 2 * CLOCK) / 1e12; // an FMA is 2 FLOPs → 66.9

// ---- world --------------------------------------------------------------------------
const PLATE = { x: -140, y: -80, w: 280, d: 160, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

const PITCH = 6;
const LANE_X = Array.from({ length: LANES }, (_, i) => -((LANES - 1) * PITCH) / 2 + i * PITCH);

const RAIL_X = [-96, 96];
const RAIL_Y = [-58, 58];
const RAIL_TOP = 3;
const TRAY = { x: -100, y: -8, w: 200, d: 16, r: 1.5 };
const TRAY_TOP = RAIL_TOP + 4;
const SLOTS = [-36, 0, 36];

const COLUMN_X = [-110, 110];
const COLUMN_R = 4.5;
const CROWN = { x: -120, y: -10, w: 240, d: 20, r: 2 };
const CROWN_Z = 92;
const CROWN_TOP = 106;

const STROKE = 13.7;
const TIP_REST = TRAY_TOP + STROKE + 0.3; // 21
const PIN_LEN = 18;
const PIN_R = 1.5;
const SLEEVE_R = 2.45;
const HEAD_Z = 31;
const HEAD_TOP = 45;
const SLEEVE_Z = 27;
const RETRACT = 5;
const BEAM = { x: -110, y: -7, w: 220, d: 14, r: 1.5 };
const BOSS_TOP = HEAD_TOP + 3;
const ROD_R = 3.2;
const ROD_TOP = 82;
const RAM_Z = 66;
const GLAND_Z = 62;
const RAM_R = 11;

const SOLENOID_TOP = 124;
const DIAL = [84, 0];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...k.boxCorners(CROWN, CROWN_Z, CROWN_TOP), [0, 0, SOLENOID_TOP]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---- base ---------------------------------------------------------------------------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // ruler strip along the front edge: one tick per lane, a major every 8 lanes
  const strip = { x: LANE_X[0] - 6, y: 63, w: LANE_X[LANES - 1] - LANE_X[0] + 12, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(LANE_X[0], LANE_X[LANES - 1], PITCH, 8, strip.y + 0.8, 0.6, [2, 3.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2.4, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2.4, strip.y + 3.5, 0.6])], { size: 0.45 }));

  // label plate, front left
  const label = { x: -133, y: 58, w: 30, d: 14, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 4, label.y + 6.4], 0.8, P, "x"), "SIMT · 32", { size: 2.6, tone: "mid" }));
  out.push(L(k.lineOnTop([label.x + 4, label.y + 9], [label.x + 22, label.y + 9], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 4, label.y + 11], [label.x + 16, label.y + 11], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 27, label.y + 3, 0.8]), at([label.x + 27, label.y + 11, 0.8])], { size: 0.4 }));
  return out.join("");
}

function rails(part) {
  const out = [];
  for (const x of RAIL_X) {
    if (part === "rails") {
      out.push(S(k.slabOf({ x: x - 2.5, y: RAIL_Y[0], w: 5, d: RAIL_Y[1] - RAIL_Y[0], r: 1 }, 0, RAIL_TOP, P, 3, 0.4), { tone: "mid" }));
      out.push(D([RAIL_Y[0] + 5, -18, 18, RAIL_Y[1] - 5].map((y) => at([x, y, RAIL_TOP])), { size: 0.4 }));
    }
  }
  const stops = (y) =>
    RAIL_X.map((x) => {
      const plan = { x: x - 4.5, y, w: 9, d: 4, r: 1 };
      return S(k.slabOf(plan, 0, 8, P, 3, 0.5), { tone: "mid" }) + D([at([x - 2, y + 2, 8]), at([x + 2, y + 2, 8])], { size: 0.42 });
    }).join("");
  if (part === "back") out.push(stops(RAIL_Y[0] - 4));
  if (part === "front") out.push(stops(RAIL_Y[1]));
  return out.join("");
}

// ---- trays (one warp each) ------------------------------------------------------------
function tray(index) {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(TRAY, 2), RAIL_TOP, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(TRAY, RAIL_TOP, TRAY_TOP - RAIL_TOP, P, 3, 0.5), { tone: "hi", crease: "lo" }));
  out.push(L(k.lineOnTop([TRAY.x, -5.2], [TRAY.x + TRAY.w, -5.2], TRAY_TOP, P), { tone: "faint" }));
  out.push(L(k.lineOnTop([TRAY.x, 5.2], [TRAY.x + TRAY.w, 5.2], TRAY_TOP, P), { tone: "faint" }));
  out.push(L(LANE_X.map((x) => k.planOutline({ x: x - 2.2, y: -2.2, w: 4.4, d: 4.4, r: 0.6 }, TRAY_TOP, P, 2)).join(""), { tone: "lo" }));
  out.push(D([at([TRAY.x + 2.4, -2.6, TRAY_TOP]), at([TRAY.x + 2.4, 2.6, TRAY_TOP]), at([TRAY.x + TRAY.w - 2.4, -2.6, TRAY_TOP]), at([TRAY.x + TRAY.w - 2.4, 2.6, TRAY_TOP])], { size: 0.42 }));
  const cells = LANE_X.map((x, lane) => `<g data-cell="${lane}" opacity="0">${D([at([x, 0, TRAY_TOP])], { size: 1.05, tone: "hi" })}</g>`);
  out.push(`<g data-cells>${cells.join("")}</g>`);
  return `<g data-tray="${index}" transform="${k.translateAlong(P, [0, SLOTS[index], 0])}">${out.join("")}</g>`;
}

// ---- press frame ----------------------------------------------------------------------
function column(x) {
  const out = [];
  out.push(S(k.cylinder(x, 0, 8, 0, 4, P, 28, 0.5), { tone: "mid" }));
  out.push(D([0, 1, 2, 3].map((q) => at([x + 6 * Math.cos(q * Math.PI / 2 + Math.PI / 4), 6 * Math.sin(q * Math.PI / 2 + Math.PI / 4), 4])).filter((_, q) => q !== 0), { size: 0.4 }));
  out.push(S(k.cylinder(x, 0, COLUMN_R, 4, CROWN_Z - 4, P, 28), { tone: "mid", crease: "none" }));
  out.push(L([12, 76, 86].map((z) => k.sideArc(x, 0, COLUMN_R, z, P, 16)).join(""), { tone: "faint" }));
  return out.join("");
}

function pin(lane) {
  const x = LANE_X[lane];
  const body = S(k.cylinder(x, 0, PIN_R, TIP_REST, PIN_LEN, P, 14), { tone: "hi", crease: "none", lit: true });
  return `<g data-pin="${lane}">${body}</g>`;
}

function crosshead() {
  const out = [];
  for (const x of byDepth(LANE_X.map((x) => [x, 0])).map(([x]) => x)) {
    out.push(S(k.cylinder(x, 0, SLEEVE_R, SLEEVE_Z, HEAD_Z - SLEEVE_Z, P, 16), { tone: "mid" }));
    out.push(L(k.sideArc(x, 0, SLEEVE_R, SLEEVE_Z + 1.2, P, 10), { tone: "faint" }));
  }
  const seam = k.sideSeam(BEAM, 38, P, 3);
  out.push(S(k.slabOf(BEAM, HEAD_Z, HEAD_TOP - HEAD_Z, P, 3, 0.6), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.lineOnTop([-110 + Math.sqrt(49 - 3.5 ** 2), -3.5], [110 - Math.sqrt(49 - 3.5 ** 2), -3.5], HEAD_TOP, P), { tone: "faint" }));
  out.push(D(LANE_X.filter((_, i) => i % 4 === 2).map((x) => at([x, 3.5, HEAD_TOP])), { size: 0.38, tone: "lo" }));
  // central boss the ram rod lands on
  out.push(S(k.cylinder(0, 0, 7, HEAD_TOP, BOSS_TOP - HEAD_TOP, P, 32, 0.5), { tone: "mid" }));
  out.push(D([[-4.6, -4.6], [4.6, -4.6], [4.6, 4.6], [-4.6, 4.6]].map(([x, y]) => at([x, y, BOSS_TOP])), { size: 0.38 }));
  return out.join("");
}

function bushing(x) {
  const out = [];
  out.push(S(k.cylinder(x, 0, 7, HEAD_Z - 2, HEAD_TOP - HEAD_Z + 4, P, 32, 0.5), { tone: "mid" }));
  out.push(L(k.sideArc(x, 0, 7, HEAD_Z + 1, P, 20) + k.sideArc(x, 0, 7, HEAD_TOP - 1, P, 20), { tone: "faint" }));
  out.push(L(k.ring(x, 0, COLUMN_R + 0.8, HEAD_TOP + 2, P, 24), { tone: "lo" }));
  out.push(D([at([x - 5, 0, HEAD_TOP + 2]), at([x + 5, 0, HEAD_TOP + 2]), at([x, -5, HEAD_TOP + 2]), at([x, 5, HEAD_TOP + 2])], { size: 0.38 }));
  return out.join("");
}

function rod() {
  return S(k.cylinder(0, 0, ROD_R, BOSS_TOP, ROD_TOP - BOSS_TOP, P, 24), { tone: "hi", crease: "none" });
}

function ram() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 5.2, GLAND_Z, RAM_Z - GLAND_Z, P, 28, 0.4), { tone: "mid" }));
  out.push(L(k.ring(0, 0, ROD_R + 0.5, GLAND_Z, P, 20), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, RAM_R + 1.2, RAM_Z, 3, P, 48, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, RAM_R, RAM_Z + 3, CROWN_Z - RAM_Z - 6, P, 48), { tone: "mid", crease: "none" }));
  out.push(L([74, 80, 86].map((z) => k.sideArc(0, 0, RAM_R, z, P, 32)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, RAM_R + 1.2, CROWN_Z - 3, 3, P, 48, 0.5), { tone: "mid" }));
  return out.join("");
}

function crown() {
  const out = [];
  const seam = k.sideSeam(CROWN, 99, P, 3);
  out.push(S(k.slabOf(CROWN, CROWN_Z, CROWN_TOP - CROWN_Z, P, 3, 1), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(CROWN, 3.5), CROWN_TOP, P, 3), { tone: "faint" }));
  out.push(D([-100, -60, -30, 30, 60].flatMap((x) => [at([x, -6.5, CROWN_TOP]), at([x, 6.5, CROWN_TOP])]), { size: 0.42 }));
  // column nuts
  for (const x of COLUMN_X) {
    out.push(S(k.cylinder(x, 0, 6.4, CROWN_TOP, 3.4, P, 6, 0.4), { tone: "mid" }));
    out.push(S(k.cylinder(x, 0, COLUMN_R, CROWN_TOP + 3.4, 1.4, P, 24), { tone: "mid" }));
    out.push(D([at([x, 0, CROWN_TOP + 4.8])], { size: 0.45, tone: "lo" }));
  }
  // valve block and solenoid: the instruction issue
  const block = { x: -16, y: -7, w: 32, d: 14, r: 1.2 };
  out.push(S(k.slabOf(block, CROWN_TOP, 10, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(block, CROWN_TOP + 4, P, 3), { tone: "faint" }) }));
  out.push(D([[-13, -4], [13, -4], [-13, 4], [13, 4]].map(([x, y]) => at([x, y, CROWN_TOP + 10])), { size: 0.42 }));
  out.push(S(k.cylinder(-6, 0, 4.4, CROWN_TOP + 10, 1.4, P, 24), { tone: "lo" }));
  out.push(S(k.cylinder(-6, 0, 3.6, CROWN_TOP + 11.4, SOLENOID_TOP - CROWN_TOP - 11.4, P, 24, 0.4), { tone: "mid" }));
  out.push(L(k.sideArc(-6, 0, 3.6, CROWN_TOP + 14, P, 16), { tone: "faint" }));
  out.push(`<g data-part="lamp">${S(k.cylinder(8, 0, 2.4, CROWN_TOP + 10, 2.2, P, 20), { tone: "hi", lit: true })}</g>`);
  // selector dial: how many lanes take the branch
  const [dx, dy] = DIAL;
  out.push(S(k.cylinder(dx, dy, 8.2, CROWN_TOP, 1, P, 48, 0.3), { tone: "lo" }));
  const ticks = k.radialTicks(dx, dy, 8, 32, 8, CROWN_TOP + 1, [1, 1.9], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(S(k.cylinder(dx, dy, 4.6, CROWN_TOP + 1, 4, P, 36), { tone: "mid" }));
  out.push(L(k.knurl(dx, dy, 4.6, CROWN_TOP + 1, CROWN_TOP + 5, 30, P, 0.3), { tone: "lo" }));
  return out.join("");
}

const pointerAt = (count) => {
  const angle = (count / 32) * Math.PI * 2;
  const [x, y] = DIAL;
  return k.lineOnTop([x, y], [x + Math.sin(angle) * 4, y - Math.cos(angle) * 4], CROWN_TOP + 5, P);
};

const pins = byDepth(LANE_X.map((x, lane) => [x, lane])).map(([, lane]) => pin(lane));

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A gang press on a bench standing for one warp scheduler of an NVIDIA GPU. A single hydraulic ram drives one crosshead that carries 32 punches, one per thread of a warp. Trays of 32 cells, each tray one warp's data, slide under the press on rails. When every lane agrees, one stroke stamps all 32 cells. When a branch splits the warp, the press strokes twice, with the lanes that took the other path pulled up each time.",
  body: [
    plate(),
    rails("rails"),
    rails("back"),
    column(COLUMN_X[0]),
    `<g data-part="trays">${[0, 1, 2].map(tray).join("")}</g>`,
    rails("front"),
    `<g data-part="pins">${pins.join("")}</g>`,
    `<g data-part="head">${crosshead()}${bushing(COLUMN_X[0])}</g>`,
    column(COLUMN_X[1]),
    `<g data-part="head2">${bushing(COLUMN_X[1])}</g>`,
    `<g data-part="rod">${rod()}</g>`,
    ram(),
    crown(),
    `<path data-part="pointer" class="iso-line" data-tone="hi" data-free="end" d="${pointerAt(32)}" style="stroke-width:1"/>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const LANES = ${LANES}, STROKE = ${STROKE}, RETRACT = ${RETRACT}, SLOTS = ${JSON.stringify(SLOTS)};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_Z = ${CROWN_TOP + 5};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const head = svg.querySelector('[data-part="head"]');
const head2 = svg.querySelector('[data-part="head2"]');
const rodEl = svg.querySelector('[data-part="rod"]');
const pointer = svg.querySelector('[data-part="pointer"]');
const lamp = svg.querySelector('[data-part="lamp"] .iso-solid');
const trayBox = svg.querySelector('[data-part="trays"]');
const pins = [...svg.querySelectorAll("[data-pin]")].sort((a, b) => a.dataset.pin - b.dataset.pin);
const pinSolids = pins.map((p) => p.querySelector(".iso-solid"));
const trays = [0, 1, 2].map((i) => ({ el: svg.querySelector('[data-tray="' + i + '"]'), slot: i, y: SLOTS[i], alpha: 1 }));
trays.forEach((t) => (t.cells = [...t.el.querySelectorAll("[data-cell]")]));
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (u) => u * u * (3 - 2 * u);
const pointerAt = ${pointerAt.toString().replace("k.lineOnTop", "lineOnTop").replace(/CROWN_TOP \+ 5/, "DIAL_Z")};

const TOUR = [32, 12, 32, 24, 32, 6];
let tourIndex = 0, touring = true, wanted = 32, dialShown = 32, idleTimer = 0;
let warp = 1, branch = 32, passes = [], pass = 0;
let phase = "mask", t = 0, headDz = 0, stamped = false;
const offset = new Array(LANES).fill(0);
let frame = 0, last = 0, visible = false;

const passesFor = (n) => (n === 0 || n === LANES ? [Array(LANES).fill(true)] : [Array.from({ length: LANES }, (_, i) => i < n), Array.from({ length: LANES }, (_, i) => i >= n)]);
const pressTray = () => trays.find((tr) => tr.slot === 1);
function say(next = false) {
  const b = next ? wanted : branch;
  const n = passesFor(b).length;
  const lanes = b === 0 || b === LANES ? "32/32 agree" : b + "/32 branch";
  const text = (next ? "next: warp " + (warp + 1) : "warp " + warp) + " · " + lanes + " · " + n + (n === 1 ? " stroke" : " strokes") + " · " + Math.round(100 / n) + "%";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(wanted));
  stage.setAttribute("aria-valuetext", wanted + " of 32 lanes take the branch");
}
function startWarp() {
  if (touring) { wanted = TOUR[tourIndex % TOUR.length]; tourIndex++; }
  branch = wanted; passes = passesFor(branch); pass = 0; phase = "mask"; t = 0; stamped = false;
  say();
}
function orderTrays() {
  [...trays].sort((a, b) => a.y - b.y).forEach((tr) => trayBox.appendChild(tr.el));
}
function draw() {
  const lift = translateAlong(P, [0, 0, headDz]);
  head.setAttribute("transform", lift);
  head2.setAttribute("transform", lift);
  rodEl.setAttribute("transform", lift);
  const mask = passes[pass] || passes[0];
  pins.forEach((el, i) => el.setAttribute("transform", translateAlong(P, [0, 0, headDz + offset[i]])));
  pinSolids.forEach((el, i) => el.toggleAttribute("data-lit", !!(mask && mask[i]) && phase !== "advance" && phase !== "fade" && phase !== "enter"));
  lamp.toggleAttribute("data-lit", phase === "stroke");
  trays.forEach((tr) => { tr.el.setAttribute("transform", translateAlong(P, [0, tr.y, 0])); tr.el.setAttribute("opacity", tr.alpha.toFixed(3)); });
  pointer.setAttribute("d", pointerAt(dialShown));
}
function stampCells() {
  const tr = pressTray();
  const mask = passes[pass];
  tr.cells.forEach((c, i) => { if (mask[i]) c.setAttribute("opacity", "1"); });
}
function step(dt) {
  t += dt;
  dialShown += (wanted - dialShown) * (1 - Math.exp(-dt / 0.15));
  const mask = passes[pass];
  const target = (i) => (phase === "mask" || phase === "stroke") && mask && !mask[i] ? RETRACT : 0;
  for (let i = 0; i < LANES; i++) offset[i] += (target(i) - offset[i]) * (1 - Math.exp(-dt / 0.07));
  if (phase === "mask") headDz += (0 - headDz) * (1 - Math.exp(-dt / 0.08));
  if (phase === "mask" && t >= 0.4) { phase = "stroke"; t = 0; stamped = false; }
  if (phase === "stroke") {
    const u = Math.min(t / 0.9, 1);
    headDz = -STROKE * (1 - Math.cos(u * Math.PI * 2)) / 2;
    if (!stamped && u >= 0.5) { stamped = true; stampCells(); }
    if (u >= 1) { headDz = 0; pass++; t = 0; phase = pass < passes.length ? "mask" : "hold"; }
  }
  if (phase === "hold" && t >= 0.5) { phase = "fade"; t = 0; }
  if (phase === "fade") {
    const front = trays.find((tr) => tr.slot === 2);
    front.alpha = 1 - ease(Math.min(t / 0.35, 1));
    if (t >= 0.35) { phase = "advance"; t = 0; trays.forEach((tr) => (tr.from = tr.y)); }
  }
  if (phase === "advance") {
    const u = ease(Math.min(t / 1.0, 1));
    trays.forEach((tr) => { if (tr.slot < 2) tr.y = tr.from + (SLOTS[tr.slot + 1] - SLOTS[tr.slot]) * u; });
    if (t >= 1.0) {
      trays.forEach((tr) => {
        if (tr.slot === 2) { tr.slot = 0; tr.y = SLOTS[0]; tr.cells.forEach((c) => c.setAttribute("opacity", "0")); }
        else { tr.slot++; tr.y = SLOTS[tr.slot]; }
      });
      orderTrays();
      phase = "enter"; t = 0;
    }
  }
  if (phase === "enter") {
    const back = trays.find((tr) => tr.slot === 0);
    back.alpha = ease(Math.min(t / 0.4, 1));
    if (t >= 0.4) { back.alpha = 1; warp++; startWarp(); }
  }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  step(dt);
  draw();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
function showStill() {
  branch = wanted; passes = passesFor(branch); pass = passes.length - 1; phase = "hold"; headDz = 0; dialShown = wanted;
  for (let i = 0; i < LANES; i++) offset[i] = passes.length > 1 && !passes[pass][i] ? RETRACT : 0;
  pressTray().cells.forEach((c) => c.setAttribute("opacity", "1"));
  say(); draw();
}
const run = () => { if (still.matches) { showStill(); return; } if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (n) => {
  touring = false; wanted = clamp(Math.round(n), 0, LANES);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { touring = true; run(); }, 6000);
  if (still.matches) { showStill(); return; }
  if (wanted !== branch && (phase === "mask" || phase === "stroke" || phase === "hold")) restartWarp();
  else if (wanted !== branch) say(true);
  run();
};
function restartWarp() {
  pressTray().cells.forEach((c) => c.setAttribute("opacity", "0"));
  branch = wanted; passes = passesFor(branch); pass = 0; phase = "mask"; t = 0; stamped = false;
  say();
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else if (frame) { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.15) / 0.7, 0, 1);
  steer(share * LANES);
});
stage.addEventListener("keydown", (event) => {
  let n = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") n = wanted + 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") n = wanted - 1;
  if (event.key === "PageUp") n = wanted + 8;
  if (event.key === "PageDown") n = wanted - 8;
  if (event.key === "Home") n = 0;
  if (event.key === "End") n = LANES;
  if (n === null) return;
  event.preventDefault();
  steer(n);
});
startWarp();
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "One warp, 32 lanes",
  hint: "Hover to split the warp",
  readout: "warp 1 · 32/32 agree · 1 stroke · 100%",
  keys: [
    { mark: "lit", label: "Punches doing work this stroke: the lanes active in the warp" },
    { mark: "raised", label: "Trays of 32 cells: one warp's data each, queued, pressed, done" },
    { mark: "edge", label: "One ram and one crosshead: a single instruction drives every lane" },
  ],
  caption: `An NVIDIA GPU is thousands of these presses. Its scheduler doesn't run threads one at a time: it issues one instruction to a warp of 32 threads, and all 32 lanes execute it in the same stroke. An H100 has ${SMS} streaming multiprocessors, each with ${SCHEDULERS} schedulers feeding ${LANES} FP32 lanes, so ${FP32_LANES.toLocaleString("en-US")} lanes each doing a fused multiply-add (2 FLOPs) per clock at ${(CLOCK / 1e9).toFixed(2)} GHz gives about ${TFLOPS.toFixed(1)} TFLOPS. The cost of the design is divergence: when an if splits a warp, the press must stroke once for each path with the other lanes held up, so half the punches sit idle each time.`,
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Lanes that take the branch, 0 to 32" aria-valuemin="0" aria-valuemax="32" aria-valuenow="32">${svg}</div>`,
});

const name = theme === "light" ? "gpu-press-light.html" : "gpu-press.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "How an NVIDIA GPU runs a warp", theme, body, script: kitScript() + live }));
console.log("wrote", name, `(${FP32_LANES} lanes, ${TFLOPS.toFixed(1)} TFLOPS)`);
