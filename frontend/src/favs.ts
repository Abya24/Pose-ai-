import { storage } from "@/src/utils/storage";

export async function getFavs(): Promise<string[]> {
  const v = await storage.getItem<string>("pm.favs", "");
  return v ? v.split(",").filter(Boolean) : [];
}

export async function toggleFav(id: string) {
  const f = await getFavs();
  const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
  await storage.setItem("pm.favs", next.join(","));
  return next;
}
