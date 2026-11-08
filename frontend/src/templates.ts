// Canvas model shared by the Creative Studio and the server renderer.
// All geometry is normalised: x/w are fractions of the whole page width (the full panorama for
// carousels), y/h fractions of the page height. Text/sticker size is a fraction of page height.

export type El = {
  id: string;
  type: "image" | "text" | "sticker";
  x: number; y: number; w: number; h: number; rot: number;
  photo_id?: string;
  border?: number; borderColor?: string; radius?: number;
  text?: string; glyph?: string; size?: number; color?: string; align?: "left" | "center";
};
export type Page = { bg: string; bg2?: string; elements: El[] };
export type Canvas = { mode: "collage" | "carousel"; aspect: "4:5" | "1:1" | "9:16"; slides: number; spacing: number; template: string; pages: Page[] };

export const ASPECT_RATIO: Record<Canvas["aspect"], number> = { "4:5": 0.8, "1:1": 1, "9:16": 9 / 16 };

let n = 0;
export const eid = () => `el${Date.now().toString(36)}${(n++).toString(36)}`;

const img = (photo_id: string, x: number, y: number, w: number, h: number, extra: Partial<El> = {}): El => ({ id: eid(), type: "image", photo_id, x, y, w, h, rot: 0, ...extra });
const txt = (text: string, x: number, y: number, size: number, color: string, extra: Partial<El> = {}): El => ({ id: eid(), type: "text", text, x, y, w: 0.6, h: size * 1.3, rot: 0, size, color, align: "left", ...extra });

export type Template = { key: string; label: string; theme: string; mode: Canvas["mode"] };
export const TEMPLATES: Template[] = [
  { key: "grid", label: "Clean Grid", theme: "Lifestyle", mode: "collage" },
  { key: "magazine", label: "Magazine Cover", theme: "Fashion", mode: "collage" },
  { key: "dump", label: "Photo Dump", theme: "Photo dump", mode: "collage" },
  { key: "polaroid", label: "Polaroid Portrait", theme: "Portraits", mode: "collage" },
  { key: "wedding", label: "Wedding Story", theme: "Wedding", mode: "collage" },
  { key: "seamless", label: "Seamless Flow", theme: "Lifestyle", mode: "carousel" },
  { key: "panorama", label: "Panorama Travel", theme: "Travel", mode: "carousel" },
  { key: "fashionstrip", label: "Fashion Strip", theme: "Fashion", mode: "carousel" },
];

function gridCells(count: number, g: number): [number, number, number, number][] {
  if (count <= 1) return [[g, g, 1 - 2 * g, 1 - 2 * g]];
  if (count === 2) return [[g, g, 1 - 2 * g, 0.5 - 1.5 * g], [g, 0.5 + g / 2, 1 - 2 * g, 0.5 - 1.5 * g]];
  if (count === 3) return [[g, g, 1 - 2 * g, 0.6 - 1.5 * g], [g, 0.6 + g / 2, 0.5 - 1.5 * g, 0.4 - 1.5 * g], [0.5 + g / 2, 0.6 + g / 2, 0.5 - 1.5 * g, 0.4 - 1.5 * g]];
  const cols = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const cw = (1 - g * (cols + 1)) / cols, ch = (1 - g * (rows + 1)) / rows;
  return Array.from({ length: count }, (_, i) => [g + (i % cols) * (cw + g), g + Math.floor(i / cols) * (ch + g), cw, ch] as [number, number, number, number]);
}

export function buildTemplate(key: string, photos: string[], mode?: Canvas["mode"], spacing = 0.02, slidesIn?: number): Canvas {
  const t = TEMPLATES.find((x) => x.key === key) ?? TEMPLATES[0];
  const m = mode ?? t.mode;
  const P = photos.length ? photos : [];
  const at = (i: number) => P[i % Math.max(1, P.length)];
  if (m === "carousel") {
    const slides = slidesIn ?? Math.min(10, Math.max(2, Math.ceil(P.length / 2) + 1));
    const sw = 1 / slides;
    const els: El[] = [];
    let bg = "#F4F1EC";
    if (t.key === "panorama" && P.length) {
      bg = "#050505";
      els.push(img(at(0), 0, 0, 1, 1));
      P.slice(1).forEach((p, i) => els.push(img(p, sw * (i + 0.7), 0.55, sw * 0.6, 0.35, { border: 0.004, borderColor: "#FFFFFF", rot: i % 2 ? 4 : -4 })));
      els.push(txt("WANDERLUST", sw * 0.08, 0.08, 0.07, "#FFFFFF"));
    } else if (t.key === "fashionstrip") {
      bg = "#111111";
      P.forEach((p, i) => els.push(img(p, sw * 0.15 + i * (sw * 0.95), i % 2 ? 0.08 : 0.22, sw * 0.75, 0.7)));
      els.push(txt("THE EDIT", sw * 0.1, 0.03, 0.05, "#FFFFFF"));
    } else {
      P.forEach((p, i) => {
        const big = i % 2 === 0;
        const x = sw * 0.12 + i * sw * 0.78;
        els.push(img(p, x, big ? 0.12 : 0.42, big ? sw * 1.05 : sw * 0.7, big ? 0.62 : 0.46, { border: 0.003, borderColor: "#FFFFFF" }));
      });
      els.push(txt("photo diary", sw * 0.1, 0.84, 0.05, "#050505"));
    }
    return { mode: "carousel", aspect: "4:5", slides, spacing, template: t.key, pages: [{ bg, elements: els }] };
  }
  const els: El[] = [];
  let bg = "#FFFFFF";
  if (t.key === "magazine" && P.length) {
    bg = "#050505";
    els.push(img(at(0), 0, 0, 1, 0.68));
    if (P[1]) els.push(img(P[1], spacing, 0.68 + spacing, 0.5 - 1.5 * spacing, 0.32 - 2 * spacing));
    if (P[2]) els.push(img(P[2], 0.5 + spacing / 2, 0.68 + spacing, 0.5 - 1.5 * spacing, 0.32 - 2 * spacing));
    els.push(txt("VOGUE\nSTORIES", 0.05, 0.04, 0.08, "#FFFFFF"));
  } else if (t.key === "dump") {
    bg = "#EDE7DF";
    const spots = [[0.06, 0.05, -6], [0.48, 0.08, 5], [0.1, 0.4, 4], [0.5, 0.42, -5], [0.25, 0.68, 3], [0.55, 0.7, -3]];
    P.slice(0, 6).forEach((p, i) => els.push(img(p, spots[i][0], spots[i][1], 0.44, 0.3, { rot: spots[i][2], border: 0.018, borderColor: "#FFFFFF" })));
    els.push({ id: eid(), type: "sticker", glyph: "✦", x: 0.88, y: 0.06, w: 0.1, h: 0.1, rot: 0, size: 0.07, color: "#651FFF" });
  } else if (t.key === "polaroid" && P.length) {
    bg = "#1F1F24";
    els.push(img(at(0), 0.1, 0.08, 0.8, 0.7, { border: 0.04, borderColor: "#FAFAFA", rot: -2 }));
    els.push(txt("golden days", 0.14, 0.82, 0.05, "#FFFFFF"));
  } else if (t.key === "wedding" && P.length) {
    bg = "#F8F3EC";
    els.push(img(at(0), 0.08, 0.06, 0.84, 0.56, { radius: 0.02 }));
    if (P[1]) els.push(img(P[1], 0.08, 0.66, 0.4, 0.26, { radius: 0.02 }));
    if (P[2]) els.push(img(P[2], 0.52, 0.66, 0.4, 0.26, { radius: 0.02 }));
    els.push(txt("Forever begins", 0.08, 0.935, 0.035, "#311B92"));
  } else {
    gridCells(Math.max(1, P.length), spacing).forEach((c, i) => P[i] && els.push(img(P[i], c[0], c[1], c[2], c[3])));
  }
  return { mode: "collage", aspect: "4:5", slides: 1, spacing, template: t.key, pages: [{ bg, elements: els }] };
}
