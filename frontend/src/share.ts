// Sharing uses only official mechanisms: the Android Sharesheet (expo-sharing), Instagram's
// documented "ADD_TO_STORY" intent, and MediaStore saving. We never claim a post was published.
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";

import { photoUri } from "@/src/api";

export async function localFile(id: string): Promise<File> {
  const f = new File(Paths.cache, `posemate-${id}.jpg`);
  if (!f.exists) await File.downloadFileAsync(photoUri(id), f);
  return f;
}

export async function copyText(text: string) {
  await Clipboard.setStringAsync(text);
}

export async function shareSheet(id: string, title = "Share photo") {
  if (Platform.OS === "web") {
    await Linking.openURL(photoUri(id));
    return "opened";
  }
  const f = await localFile(id);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
  await Sharing.shareAsync(f.uri, { mimeType: "image/jpeg", dialogTitle: title, UTI: "public.jpeg" });
  return "sheet";
}

// Instagram lists "Stories" as a target inside the Android Sharesheet.
export async function shareToStory(id: string) {
  return shareSheet(id, "Share to Instagram Stories");
}

export async function saveLocalToGallery(uri: string) {
  let perm = await MediaLibrary.getPermissionsAsync(true);
  if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    const err: any = new Error("Allow photo access to save to your gallery");
    err.settings = !perm.canAskAgain;
    throw err;
  }
  await MediaLibrary.Asset.create(uri);
}

export async function saveToGallery(ids: string[]) {
  if (Platform.OS === "web") {
    for (const id of ids) await Linking.openURL(photoUri(id));
    return ids.length;
  }
  for (const id of ids) {
    const f = await localFile(id);
    await saveLocalToGallery(f.uri);
  }
  return ids.length;
}
