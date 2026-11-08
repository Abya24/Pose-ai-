export type Adjust = Partial<Record<AdjustKey, number>>;
export type AdjustKey =
  | "exposure" | "brightness" | "contrast" | "highlights" | "shadows" | "saturation"
  | "temperature" | "tint" | "sharpness" | "denoise" | "blur" | "vignette";

export type EditParams = {
  adjust?: Adjust;
  filter?: string;
  rotate?: number;
  straighten?: number;
  flipH?: boolean;
  flipV?: boolean;
  crop?: { aspect: string; zoom: number; cx: number; cy: number };
  texts?: { text: string; x: number; y: number; size: number; color: string }[];
  stickers?: { glyph: string; x: number; y: number; size: number; color: string }[];
  frame?: { style: string };
};

export const ADJUSTMENTS: { key: AdjustKey; label: string; min: number; max: number }[] = [
  { key: "exposure", label: "Exposure", min: -100, max: 100 },
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "temperature", label: "Temperature", min: -100, max: 100 },
  { key: "tint", label: "Tint", min: -100, max: 100 },
  { key: "sharpness", label: "Sharpen", min: 0, max: 100 },
  { key: "denoise", label: "Noise reduction", min: 0, max: 100 },
  { key: "blur", label: "Blur", min: 0, max: 100 },
  { key: "vignette", label: "Vignette", min: 0, max: 100 },
];

export const FILTERS = ["none", "vivid", "warm", "cool", "golden", "cinematic", "film", "pastel", "fade", "vintage", "mono", "noir"];
export const FRAMES = ["none", "white", "black", "polaroid", "film", "gradient"];
export const ASPECTS = ["original", "1:1", "4:5", "3:4", "9:16", "16:9"];
export const STICKERS = ["★", "✦", "♥", "✿", "❀", "☀", "☾", "✈", "♪", "☁", "✧", "❤", "☺", "✌", "⚘", "➶"];
export const SWATCHES = ["#FFFFFF", "#050505", "#651FFF", "#2979FF", "#FFC400", "#FF1744", "#00E676", "#F8BBD0"];

export type Preset = { id: string; name: string; group: string; params: Pick<EditParams, "adjust" | "filter"> };

export const BUILTIN_PRESETS: Preset[] = [
  { id: "pro-clean", group: "Professional", name: "Clean Pro", params: { filter: "none", adjust: { contrast: 12, highlights: -20, shadows: 18, sharpness: 25, saturation: 6 } } },
  { id: "pro-matte", group: "Professional", name: "Matte", params: { filter: "fade", adjust: { contrast: -8, saturation: -10, shadows: 10 } } },
  { id: "pro-cine", group: "Professional", name: "Cinematic", params: { filter: "cinematic", adjust: { contrast: 10, vignette: 30, saturation: -5 } } },
  { id: "por-glow", group: "Portrait", name: "Soft Glow", params: { filter: "none", adjust: { exposure: 8, highlights: -15, shadows: 20, temperature: 8, sharpness: 10, denoise: 30 } } },
  { id: "por-bw", group: "Portrait", name: "Classic B&W", params: { filter: "mono", adjust: { contrast: 18, sharpness: 20 } } },
  { id: "por-warm", group: "Portrait", name: "Warm Skin", params: { filter: "warm", adjust: { tint: 4, shadows: 12, saturation: -4 } } },
  { id: "tra-vivid", group: "Travel", name: "Vivid Escape", params: { filter: "vivid", adjust: { contrast: 10, highlights: -18, shadows: 12, sharpness: 20 } } },
  { id: "tra-teal", group: "Travel", name: "Teal & Orange", params: { filter: "cinematic", adjust: { saturation: 12, temperature: 6, contrast: 12 } } },
  { id: "tra-golden", group: "Travel", name: "Golden Hour", params: { filter: "golden", adjust: { highlights: -12, vignette: 20 } } },
  { id: "wed-airy", group: "Wedding", name: "Airy Bride", params: { filter: "pastel", adjust: { exposure: 12, contrast: -6, highlights: -20, temperature: 4 } } },
  { id: "wed-royal", group: "Wedding", name: "Royal Rich", params: { filter: "warm", adjust: { contrast: 15, saturation: 12, shadows: 8, vignette: 25 } } },
  { id: "wed-film", group: "Wedding", name: "Film Romance", params: { filter: "film", adjust: { temperature: 8, contrast: 5 } } },
  { id: "lif-pastel", group: "Lifestyle", name: "Pastel Day", params: { filter: "pastel", adjust: { exposure: 6, saturation: -6 } } },
  { id: "lif-moody", group: "Lifestyle", name: "Moody", params: { filter: "noir", adjust: { contrast: 8, vignette: 35 } } },
  { id: "lif-cool", group: "Lifestyle", name: "Urban Cool", params: { filter: "cool", adjust: { contrast: 12, saturation: -8, sharpness: 15 } } },
];
