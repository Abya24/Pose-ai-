import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LANGS } from "@/src/langs";
import { api, photoUri, type Project } from "@/src/api";
import { Chip, EmptyState, GradientButton, Icon, IconButton, OutlineButton, PressScale, Title, toast, type IconName } from "@/src/components/ui";
import { copyText, saveToGallery, shareSheet, shareToStory } from "@/src/share";
import { colors, radius, spacing } from "@/src/theme";

const TONES = ["aesthetic", "funny", "romantic", "travel", "minimal", "festive"];
type Gen = { captions: string[]; hashtags: string[]; story_text: string; description: string };

export default function Share() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState<Project | null>(null);
  const [lang, setLang] = useState("English");
  const [tone, setTone] = useState("aesthetic");
  const [context, setContext] = useState("");
  const [gen, setGen] = useState<Gen | null>(null);
  const [loading, setLoading] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    api<Project>(`/projects/${id}`).then((p) => { setProject(p); setCaption(p.caption || ""); setTags(p.hashtags || ""); }).catch((e) => toast.show(e.message, "error"));
  }, [id]);

  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => api(`/projects/${id}`, { method: "PATCH", body: { caption, hashtags: tags } }).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [caption, tags]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return <View style={[styles.root, styles.center]}><ActivityIndicator color={colors.brand} /></View>;
  const exp = project.exports || [];
  if (!exp.length) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EmptyState icon="cloud-upload-outline" title="Nothing exported yet" text="Open the project and tap Next/Export to create high-resolution images." testID="share-empty">
          <OutlineButton label="Back to project" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const generate = async () => {
    setLoading(true); setGenErr(null);
    try {
      const r = await api<Gen>("/content/generate", { body: { photo_id: exp[0], context, language: lang, tone } });
      setGen(r);
      if (!caption) setCaption(r.captions[0] || "");
      if (!tags) setTags(r.hashtags.join(" "));
    } catch (e: any) { setGenErr(e.message); } finally { setLoading(false); }
  };

  const full = [caption, tags].filter(Boolean).join("\n\n");
  const run = async (k: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(k);
    try { await fn(); if (msg) toast.show(msg, "success"); }
    catch (e: any) { toast.show(e.message || "Something went wrong", "error"); if (e.settings) Linking.openSettings(); }
    finally { setBusy(null); }
  };

  const toApp = (app: string) => run(app, async () => {
    if (full) await copyText(full);
    await shareSheet(exp[current], `Share to ${app}`);
    toast.show(full ? `Caption copied — choose ${app} and paste it there` : `Choose ${app} in the share sheet`, "info");
  });

  const targets: { k: string; label: string; icon: IconName; fn: () => void }[] = [
    { k: "Instagram", label: "Instagram Post", icon: "logo-instagram", fn: () => toApp("Instagram") },
    { k: "story", label: "Instagram Story", icon: "add-circle-outline", fn: () => run("story", async () => { if (full) await copyText(caption); await shareToStory(exp[current]); toast.show("Opened — finish posting in Instagram", "info"); }) },
    { k: "WhatsApp", label: "WhatsApp", icon: "logo-whatsapp", fn: () => toApp("WhatsApp") },
    { k: "Facebook", label: "Facebook", icon: "logo-facebook", fn: () => toApp("Facebook") },
    { k: "Telegram", label: "Telegram", icon: "paper-plane-outline", fn: () => toApp("Telegram") },
    { k: "Snapchat", label: "Snapchat", icon: "logo-snapchat", fn: () => toApp("Snapchat") },
    { k: "Pinterest", label: "Pinterest", icon: "logo-pinterest", fn: () => toApp("Pinterest") },
    { k: "more", label: "More apps", icon: "share-social-outline", fn: () => run("more", () => shareSheet(exp[current])) },
  ];

  return (
    <View style={styles.root} testID="share-screen">
      <View style={[styles.head, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="chevron-back" onPress={() => router.back()} testID="share-back" />
        <Title size={20} style={{ flex: 1, marginLeft: spacing.sm }}>Preview & share</Title>
        <IconButton name="home-outline" onPress={() => router.replace("/(tabs)")} testID="share-home" />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} bottomOffset={24}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))}>
          {exp.map((p, i) => (
            <View key={p} style={styles.slide}>
              <Image source={{ uri: photoUri(p, 1080) }} style={styles.img} contentFit="contain" testID={`share-image-${i}`} />
            </View>
          ))}
        </ScrollView>
        <Text style={styles.counter} testID="share-counter">{exp.length > 1 ? `Slide ${current + 1} of ${exp.length} — carousel order is preserved` : "High-resolution JPEG ready"}</Text>

        <View style={styles.section}>
          <Text style={styles.h}>Share</Text>
          <View style={styles.grid}>
            {targets.map((t) => (
              <PressScale key={t.k} testID={`share-${t.k.toLowerCase()}`} onPress={t.fn} disabled={!!busy} style={styles.target}>
                {busy === t.k ? <ActivityIndicator color={colors.brand} /> : <Icon name={t.icon} size={24} color={colors.onSurface} />}
                <Text style={styles.targetText} numberOfLines={1}>{t.label}</Text>
              </PressScale>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <OutlineButton style={{ flex: 1 }} label={exp.length > 1 ? `Save all ${exp.length}` : "Save to Gallery"} icon="download-outline" loading={busy === "save"} testID="share-save-gallery"
              onPress={() => run("save", () => saveToGallery(exp), exp.length > 1 ? `Saved ${exp.length} slides in order` : "Saved to gallery")} />
          </View>
          {exp.length > 1 ? <Text style={styles.note}>Instagram carousels: save all slides, then in Instagram tap + → Post and select them in order 1 → {exp.length}.</Text> : null}
          <Text style={styles.note}>PoseMate opens the app you pick; posting is confirmed only inside that app.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.h}>Caption & hashtags · ABYA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 56 }} contentContainerStyle={styles.chips}>
            {LANGS.map((l) => <Chip key={l} label={l} active={lang === l} onPress={() => setLang(l)} testID={`share-lang-${l.toLowerCase()}`} />)}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 56 }} contentContainerStyle={styles.chips}>
            {TONES.map((t) => <Chip key={t} label={t} active={tone === t} onPress={() => setTone(t)} testID={`share-tone-${t}`} />)}
          </ScrollView>
          <TextInput testID="share-context-input" value={context} onChangeText={setContext} placeholder="Optional: place, occasion, vibe (e.g. Diwali at Jaipur)" placeholderTextColor={colors.muted} style={styles.input} />
          <GradientButton label={gen ? "Regenerate" : "Generate with ABYA"} icon="sparkles" loading={loading} onPress={generate} testID="share-generate" style={{ marginTop: spacing.md }} />
          {genErr ? <Text style={[styles.note, { color: colors.error }]}>{genErr}</Text> : null}
          {gen ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }} testID="share-generated">
              <Text style={styles.label}>Tap a caption to use it</Text>
              {gen.captions.map((c, i) => (
                <PressScale key={i} testID={`share-caption-option-${i}`} onPress={() => setCaption(c)} style={[styles.option, caption === c && { borderColor: colors.brandPrimary }]}>
                  <Text style={styles.optionText}>{c}</Text>
                </PressScale>
              ))}
              {gen.story_text ? <PressScale testID="share-story-text" onPress={() => { copyText(gen.story_text); toast.show("Story text copied", "success"); }} style={styles.option}><Text style={styles.label}>Story text · tap to copy</Text><Text style={styles.optionText}>{gen.story_text}</Text></PressScale> : null}
              {gen.description ? <View style={styles.option}><Text style={styles.label}>Photo description (alt text)</Text><Text style={styles.optionText}>{gen.description}</Text></View> : null}
            </View>
          ) : null}
          <Text style={[styles.label, { marginTop: spacing.lg }]}>Your caption (edit & approve)</Text>
          <TextInput testID="share-caption-input" value={caption} onChangeText={setCaption} multiline placeholder="Write or generate a caption" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]} />
          <Text style={[styles.label, { marginTop: spacing.md }]}>Hashtags</Text>
          <TextInput testID="share-hashtags-input" value={tags} onChangeText={setTags} multiline placeholder="#photography #portrait" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <OutlineButton style={{ flex: 1 }} label="Copy caption" icon="copy-outline" testID="share-copy-caption" onPress={() => { copyText(caption); toast.show("Caption copied", "success"); }} />
            <OutlineButton style={{ flex: 1 }} label="Copy hashtags" icon="pricetag-outline" testID="share-copy-hashtags" onPress={() => { copyText(tags); toast.show("Hashtags copied", "success"); }} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  slide: { width: 390, maxWidth: "100%", paddingHorizontal: spacing.lg },
  img: { width: "100%", aspectRatio: 0.8, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  counter: { color: colors.muted, textAlign: "center", fontSize: 12, marginTop: spacing.sm },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  h: { color: colors.onSurface, fontWeight: "700", fontSize: 17, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  target: { width: "22.5%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, padding: 4 },
  targetText: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "600" },
  note: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, lineHeight: 17 },
  chips: { gap: spacing.sm, alignItems: "center" },
  input: { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15, marginTop: spacing.sm },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  option: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: 4 },
  optionText: { color: colors.onSurface, lineHeight: 20 },
});
