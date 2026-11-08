// Pose geometry, explainable Pose Match and live coaching rules.
// Everything here is computed from measured landmarks (MediaPipe BlazePose indices).
import type { Fig, Pose } from "@/src/data/poses";
import type { Analysis } from "@/src/api";

export type Pt = [number, number, number?]; // x, y, visibility
export type Person = Record<number, Pt>;

export const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (a: number): [number, number] => [Math.sin(rad(a)), Math.cos(rad(a))];

export function buildFigure(f: Fig): Person {
  const s = f.s ?? 1;
  const cx = f.x ?? 0;
  const torso = f.torso ?? 180;
  const add = (p: [number, number], a: number, len: number): [number, number] => {
    const d = dir(a);
    return [p[0] + d[0] * len * s, p[1] + d[1] * len * s];
  };
  const hip: [number, number] = [cx, 0];
  const shC = add(hip, torso, 0.3);
  const perp = dir(torso - 90);
  const off = (p: [number, number], k: number): [number, number] => [p[0] + perp[0] * k * s, p[1] + perp[1] * k * s];
  const lSh = off(shC, 0.1), rSh = off(shC, -0.1), lHip = off(hip, 0.065), rHip = off(hip, -0.065);
  const lEl = add(lSh, f.lUA, 0.15), lWr = add(lEl, f.lFA, 0.14);
  const rEl = add(rSh, f.rUA, 0.15), rWr = add(rEl, f.rFA, 0.14);
  const lKn = add(lHip, f.lTh, 0.21), lAn = add(lKn, f.lSh, 0.21);
  const rKn = add(rHip, f.rTh, 0.21), rAn = add(rKn, f.rSh, 0.21);
  const headA = torso + (f.head ?? 0);
  const nose = add(shC, headA, 0.11);
  const hp = dir(headA - 90);
  const ear = (k: number): Pt => [nose[0] + hp[0] * k * s, nose[1] + hp[1] * k * s, 1];
  const v = (p: [number, number]): Pt => [p[0], p[1], 1];
  return {
    0: v(nose), 2: ear(0.02), 5: ear(-0.02), 7: ear(0.04), 8: ear(-0.04),
    11: v(lSh), 12: v(rSh), 13: v(lEl), 14: v(rEl), 15: v(lWr), 16: v(rWr),
    23: v(lHip), 24: v(rHip), 25: v(lKn), 26: v(rKn), 27: v(lAn), 28: v(rAn),
  };
}

export function poseFigures(p: Pose): Person[] {
  return p.figures.map(buildFigure);
}

export function fromLandmarks(lm: [number, number, number][]): Person {
  const out: Person = {};
  lm.forEach((p, i) => (out[i] = p));
  return out;
}

// ------------------------------------------------------------------ matching
type Seg = { key: string; label: string; a: number | "midHip" | "midSh"; b: number | "midSh" | "nose"; w: number; side: 1 | -1 | 0 };
const SEGMENTS: Seg[] = [
  { key: "torso", label: "torso", a: "midHip", b: "midSh", w: 1.5, side: 0 },
  { key: "head", label: "head", a: "midSh", b: "nose", w: 0.6, side: 0 },
  { key: "lUA", label: "left upper arm", a: 11, b: 13, w: 1, side: 1 },
  { key: "lFA", label: "left forearm", a: 13, b: 15, w: 1, side: 1 },
  { key: "rUA", label: "right upper arm", a: 12, b: 14, w: 1, side: -1 },
  { key: "rFA", label: "right forearm", a: 14, b: 16, w: 1, side: -1 },
  { key: "lTh", label: "left thigh", a: 23, b: 25, w: 1, side: 1 },
  { key: "lSh", label: "left lower leg", a: 25, b: 27, w: 0.8, side: 1 },
  { key: "rTh", label: "right thigh", a: 24, b: 26, w: 1, side: -1 },
  { key: "rSh", label: "right lower leg", a: 26, b: 28, w: 0.8, side: -1 },
];
const VIS = 0.5;

function pt(p: Person, k: number | "midHip" | "midSh" | "nose"): Pt | null {
  if (k === "midHip" || k === "midSh") {
    const [i, j] = k === "midHip" ? [23, 24] : [11, 12];
    const a = p[i], b = p[j];
    if (!a || !b || (a[2] ?? 1) < VIS || (b[2] ?? 1) < VIS) return null;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1];
  }
  const q = p[k === "nose" ? 0 : k];
  if (!q || (q[2] ?? 1) < VIS) return null;
  return q;
}

function vec(p: Person, s: Seg): [number, number] | null {
  const a = pt(p, s.a), b = pt(p, s.b);
  if (!a || !b) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const n = Math.hypot(dx, dy) || 1;
  return [dx / n, dy / n];
}

const angleOf = (v: [number, number]) => (Math.atan2(v[0], v[1]) * 180) / Math.PI;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export function mirrorPerson(p: Person): Person {
  const swap: Record<number, number> = { 2: 5, 5: 2, 7: 8, 8: 7, 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15, 23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27 };
  const out: Person = {};
  Object.entries(p).forEach(([k, v]) => {
    const i = Number(k);
    out[swap[i] ?? i] = [1 - v[0], v[1], v[2]];
  });
  return out;
}

export type SegResult = { key: string; label: string; diff: number | null; status: "match" | "close" | "off" | "hidden" };
export type MatchResult = {
  score: number; // 0-100, weighted from per-segment angle differences
  coverage: number; // fraction of segments visible
  mirrored: boolean;
  segments: SegResult[];
  suggestions: string[];
};

function compareOne(ref: Person, live: Person): { score: number; coverage: number; segs: SegResult[]; sugg: string[] } {
  let wsum = 0, ssum = 0, seen = 0;
  const segs: SegResult[] = [];
  const worst: { s: Seg; diff: number; r: [number, number]; l: [number, number] }[] = [];
  for (const s of SEGMENTS) {
    const r = vec(ref, s), l = vec(live, s);
    if (!r || !l) {
      segs.push({ key: s.key, label: s.label, diff: null, status: "hidden" });
      continue;
    }
    seen++;
    const diff = angDiff(angleOf(r), angleOf(l));
    const sc = diff <= 10 ? 1 : Math.max(0, 1 - (diff - 10) / 50);
    wsum += s.w;
    ssum += s.w * sc;
    segs.push({ key: s.key, label: s.label, diff: Math.round(diff), status: diff <= 15 ? "match" : diff <= 30 ? "close" : "off" });
    if (diff > 20) worst.push({ s, diff, r, l });
  }
  worst.sort((a, b) => b.diff * b.s.w - a.diff * a.s.w);
  const sugg = worst.slice(0, 3).map(({ s, r, l }) => {
    if (s.key === "torso") return r[0] > l[0] ? "Lean your upper body a little toward image right." : "Lean your upper body a little toward image left.";
    if (s.key === "head") return r[0] > l[0] ? "Tilt or turn your head slightly toward image right." : "Tilt or turn your head slightly toward image left.";
    const dy = r[1] - l[1];
    if (dy < -0.3) return `Raise your ${s.label}.`;
    if (dy > 0.3) return `Lower your ${s.label}.`;
    const out = (r[0] - l[0]) * s.side > 0;
    return out ? `Move your ${s.label} further out from your body.` : `Bring your ${s.label} closer to your body.`;
  });
  return { score: wsum ? (ssum / wsum) * 100 : 0, coverage: seen / SEGMENTS.length, segs, sugg };
}

export function matchPose(refs: Person[], lives: Person[]): MatchResult | null {
  if (!lives.length) return null;
  const sortX = (arr: Person[]) => [...arr].sort((a, b) => ((a[11]?.[0] ?? 0) + (a[12]?.[0] ?? 0)) - ((b[11]?.[0] ?? 0) + (b[12]?.[0] ?? 0)));
  const R = sortX(refs), L = sortX(lives);
  const run = (mirror: boolean) => {
    const parts = R.map((ref, i) => {
      const live = L[i];
      if (!live) return { score: 0, coverage: 0, segs: [] as SegResult[], sugg: ["Not everyone in the reference is in the frame yet."] };
      return compareOne(mirror ? mirrorPerson(ref) : ref, live);
    });
    const score = parts.reduce((a, p) => a + p.score, 0) / parts.length;
    return { score, parts };
  };
  const a = run(false), b = run(true);
  const best = b.score > a.score + 3 ? b : a;
  const mirrored = best === b;
  const main = best.parts[0];
  const suggestions = best.parts.flatMap((p, i) => (R.length > 1 ? p.sugg.map((s) => `Person ${i + 1}: ${s}`) : p.sugg)).slice(0, 4);
  return {
    score: Math.round(best.score),
    coverage: main.coverage,
    mirrored,
    segments: main.segs,
    suggestions,
  };
}

// ------------------------------------------------------------------ live coaching
export type Tip = { level: "good" | "warn" | "bad"; text: string };

export function lightingTips(l: Analysis["lighting"]): Tip[] {
  const tips: Tip[] = [];
  if (l.mean < 55) tips.push({ level: "bad", text: "Low light — move toward a window or add a light" });
  else if (l.mean < 90 && l.p95 < 160) tips.push({ level: "warn", text: "Underexposed — face the light source" });
  if (l.clipped_highlights > 6 || l.mean > 205) tips.push({ level: "warn", text: "Highlights blown out — avoid direct sun or step into shade" });
  if (l.edge_mean - l.center_mean > 40) tips.push({ level: "warn", text: "Bright background — subject may be backlit" });
  if (!tips.length && l.std < 28) tips.push({ level: "warn", text: "Flat light — look for side light for more depth" });
  if (!tips.length) tips.push({ level: "good", text: "Exposure looks balanced" });
  return tips;
}

export function bodyTips(p: Person): Tip[] {
  const tips: Tip[] = [];
  const ls = pt(p, 11), rs = pt(p, 12), nose = pt(p, 0);
  if (ls && rs) {
    const tilt = (Math.atan2(ls[1] - rs[1], ls[0] - rs[0]) * 180) / Math.PI;
    if (Math.abs(tilt) > 8 && Math.abs(tilt) < 172) tips.push({ level: "warn", text: "Shoulders uneven — relax and level them" });
    const hipM = pt(p, "midHip"), shM = pt(p, "midSh");
    if (hipM && shM) {
      const width = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]);
      const torso = Math.hypot(shM[0] - hipM[0], shM[1] - hipM[1]) || 1;
      const r = width / torso;
      tips.push({ level: "good", text: r < 0.35 ? "Body: side-on" : r < 0.6 ? "Body: three-quarter turn" : "Body: facing camera" });
      const lean = Math.abs((Math.atan2(shM[0] - hipM[0], hipM[1] - shM[1]) * 180) / Math.PI);
      if (lean > 14) tips.push({ level: "warn", text: "Leaning — stand taller unless the pose needs it" });
    }
    if (nose) {
      const mid = (ls[0] + rs[0]) / 2;
      const width = Math.abs(ls[0] - rs[0]) || 0.01;
      const off = (nose[0] - mid) / width;
      if (Math.abs(off) > 0.35) tips.push({ level: "good", text: "Head turned — good for profile shots" });
    }
    const lw = pt(p, 15), rw = pt(p, 16);
    if ((lw && lw[1] < ls[1]) || (rw && rw[1] < rs[1])) tips.push({ level: "good", text: "Hands raised above shoulders" });
  }
  return tips;
}

export function framingTips(p: Person): Tip[] {
  const tips: Tip[] = [];
  const vis = Object.entries(p).filter(([, v]) => (v[2] ?? 1) >= VIS && v[0] >= 0 && v[0] <= 1 && v[1] >= 0 && v[1] <= 1);
  if (!vis.length) return tips;
  const xs = vis.map(([, v]) => v[0]), ys = vis.map(([, v]) => v[1]);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const nose = pt(p, 0);
  if (nose && nose[1] < 0.08) tips.push({ level: "warn", text: "Too little headroom — tilt the camera down a bit" });
  const knee = pt(p, 25) || pt(p, 26), ankle = pt(p, 27) || pt(p, 28);
  if (knee && !ankle) tips.push({ level: "warn", text: "Feet cut off — step back or frame above the knees" });
  if (maxY - minY < 0.35) tips.push({ level: "warn", text: "Subject is small — move closer or zoom in" });
  if (Math.abs(cx - 0.5) > 0.22 && Math.abs(cx - 1 / 3) > 0.06 && Math.abs(cx - 2 / 3) > 0.06)
    tips.push({ level: "warn", text: "Off-balance — centre the subject or put them on a third line" });
  else if (Math.abs(cx - 1 / 3) <= 0.06 || Math.abs(cx - 2 / 3) <= 0.06) tips.push({ level: "good", text: "Nice rule-of-thirds placement" });
  const eye = pt(p, 2) || pt(p, 5);
  if (eye && maxY - minY > 0.5 && eye[1] > 0.45) tips.push({ level: "warn", text: "Eyes low in frame — keep them near the top third" });
  return tips;
}
