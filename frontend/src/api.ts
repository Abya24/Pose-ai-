import { storage } from "@/src/utils/storage";
import { uploadForm } from "@/src/utils/upload";

export const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

let deviceId = "";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// A private, random id for this install. Every photo/project is scoped to it on the server.
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  let id = await storage.getItem<string | null>("pm.device", null);
  if (!id) {
    id = uuid();
    await storage.setItem("pm.device", id);
  }
  deviceId = id;
  return id;
}

export type Photo = { id: string; width: number; height: number; kind: string; source_id?: string | null; url: string };

export type Project = {
  id: string;
  name: string;
  type: "photo" | "batch" | "collage" | "carousel";
  photos: string[];
  edits: Record<string, any>;
  canvas: any;
  caption: string;
  hashtags: string;
  exports: string[];
  status: "draft" | "exported";
  cover: string | null;
  created_at: string;
  updated_at: string;
};

async function errorText(res: Response) {
  try {
    const j = await res.json();
    if (typeof j.detail === "string") return j.detail;
  } catch {}
  return `Request failed (${res.status})`;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const d = await getDeviceId();
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", "X-Device-Id": d },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export function photoUri(id: string, w?: number) {
  return `${BASE}/api/photos/${id}/file?d=${deviceId}${w ? `&w=${w}` : ""}`;
}

export async function uploadPhoto(uri: string, mimeType?: string | null): Promise<Photo> {
  const d = await getDeviceId();
  const res = await uploadForm(`${BASE}/api/photos`, {
    headers: { "X-Device-Id": d },
    files: { file: { uri, name: "photo.jpg", mimeType: mimeType || "image/jpeg" } },
  });
  if (!res.ok) throw new Error(await errorText(res as any));
  return res.json();
}

export type Analysis = {
  width: number;
  height: number;
  persons: { landmarks: [number, number, number][] }[];
  lighting: {
    mean: number;
    std: number;
    p5: number;
    p95: number;
    clipped_highlights: number;
    crushed_shadows: number;
    center_mean: number;
    edge_mean: number;
  };
};

export async function analyzeFrame(uri: string, signal?: AbortSignal): Promise<Analysis> {
  const res = await uploadForm(`${BASE}/api/vision/analyze`, {
    headers: { "X-Device-Id": await getDeviceId() },
    files: { file: { uri, name: "frame.jpg", mimeType: "image/jpeg" } },
    signal,
  });
  if (!res.ok) throw new Error(await errorText(res as any));
  return res.json();
}
