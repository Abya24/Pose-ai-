import * as ImagePicker from "expo-image-picker";

import { api, uploadPhoto, type Project } from "@/src/api";
import { buildTemplate } from "@/src/templates";

export async function pickImages(multiple: boolean) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 10 : 1,
    quality: 1,
  });
  if (res.canceled) return [];
  return res.assets;
}

export async function uploadAssets(assets: ImagePicker.ImagePickerAsset[]) {
  const out: string[] = [];
  for (const a of assets) {
    const p = await uploadPhoto(a.uri, a.mimeType);
    out.push(p.id);
  }
  return out;
}

export async function createProject(type: Project["type"], photos: string[]) {
  let canvas = null;
  if (type === "collage") canvas = buildTemplate("grid", photos, "collage");
  if (type === "carousel") canvas = buildTemplate("seamless", photos, "carousel");
  return api<Project>("/projects", { body: { type, photos, canvas } });
}

export function projectRoute(p: Pick<Project, "id" | "type">) {
  return (p.type === "collage" || p.type === "carousel" ? `/studio/${p.id}` : `/editor/${p.id}`) as any;
}
