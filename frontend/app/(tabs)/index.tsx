import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, photoUri, type Project } from "@/src/api";
import { SkeletonView } from "@/src/components/Skeleton";
import { GradientButton, Icon, PressScale, Title, toast, type IconName } from "@/src/components/ui";
import { POSES } from "@/src/data/poses";
import { usesNativeTabs } from "@/src/navigation";
import { poseFigures } from "@/src/pose/match";
import { createProject, pickImages, projectRoute, uploadAssets } from "@/src/projects";
import { colors, fonts, radius, spacing } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1663970206579-c157cba7edda?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const TOOLS: { key: string; label: string; icon: IconName; hint: string }[] = [
  { key: "photo", label: "Edit Photo", icon: "color-wand", hint: "Adjust, filters, AI" },
  { key: "batch", label: "Batch Edit", icon: "layers", hint: "One preset, many photos" },
  { key: "collage", label: "Collage", icon: "grid", hint: "Templates & layers" },
  { key: "carousel", label: "Carousel", icon: "albums", hint: "Seamless slides" },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [recent, setRecent] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    api<Project[]>("/projects").then((p) => setRecent(p.slice(0, 8))).catch(() => setRecent([]));
  }, []));

  const start = async (type: Project["type"]) => {
    try {
      const assets = await pickImages(type !== "photo");
      if (!assets.length) return;
      setBusy(type);
      const ids = await uploadAssets(assets);
      const p = await createProject(type, ids);
      router.push(projectRoute(p));
    } catch (e: any) {
      toast.show(e.message || "Could not start project", "error");
    } finally {
      setBusy(null);
    }
  };

  const featured = POSES.slice(0, 6);
  const card = (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Title size={26}>PoseMate AI</Title>
            <Text style={styles.powered}>POWERED BY ABYA</Text>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <PressScale testID="home-premium" onPress={() => router.push("/premium")} style={[styles.abyaBtn, { backgroundColor: colors.surfaceTertiary }]}>
              <Icon name="diamond" size={18} color={colors.warning} />
            </PressScale>
            <PressScale testID="home-ask-abya" onPress={() => router.push("/(tabs)/abya")} style={styles.abyaBtn}>
              <Icon name="sparkles" size={18} color={colors.onSurface} />
            </PressScale>
          </View>
        </View>

        <View style={styles.hero} testID="home-hero">
          <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          <LinearGradient colors={["rgba(5,5,5,0.1)", "rgba(5,5,5,0.95)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroBody}>
            <Text style={styles.kicker}>AI PHOTO STUDIO</Text>
            <Title size={28} style={{ lineHeight: 32 }}>Pick a pose.{"\n"}Get live guidance.</Title>
            <Text style={styles.heroText}>Pose match, lighting & framing coach, then edit and share.</Text>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
              <GradientButton testID="home-start-shoot" label="Start a shoot" icon="camera" onPress={() => router.push("/(tabs)/poses")} style={{ flex: 1 }} />
            </View>
          </View>
        </View>

        <Text style={styles.section}>Create</Text>
        <View style={styles.tools}>
          {TOOLS.map((t) => (
            <PressScale key={t.key} testID={`home-tool-${t.key}`} onPress={() => start(t.key as Project["type"])} style={[styles.tool, { width: card }]} disabled={!!busy}>
              <View style={styles.toolIcon}>{busy === t.key ? <ActivityIndicator color={colors.brand} /> : <Icon name={t.icon} size={22} color={colors.brand} />}</View>
              <Text style={styles.toolLabel}>{t.label}</Text>
              <Text style={styles.toolHint}>{t.hint}</Text>
            </PressScale>
          ))}
        </View>

        <View style={styles.rowHead}>
          <Text style={styles.section}>Trending poses</Text>
          <PressScale testID="home-see-poses" onPress={() => router.push("/(tabs)/poses")}><Text style={styles.link}>See all</Text></PressScale>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {featured.map((p) => (
            <PressScale key={p.id} testID={`home-pose-${p.id}`} onPress={() => router.push(`/pose/${p.id}`)} style={styles.poseCard}>
              <LinearGradient colors={[colors.brandTertiary, colors.surfaceSecondary]} style={StyleSheet.absoluteFill} />
              <SkeletonView persons={poseFigures(p)} width={130} height={150} color={colors.onSurface} strokeWidth={3} />
              <Text style={styles.poseName} numberOfLines={1}>{p.name}</Text>
            </PressScale>
          ))}
        </ScrollView>

        <View style={styles.rowHead}>
          <Text style={styles.section}>Continue editing</Text>
          <PressScale testID="home-see-projects" onPress={() => router.push("/(tabs)/projects")}><Text style={styles.link}>All projects</Text></PressScale>
        </View>
        {recent === null ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
        ) : recent.length === 0 ? (
          <View style={styles.emptyRecent} testID="home-no-projects">
            <Icon name="images-outline" size={22} color={colors.muted} />
            <Text style={{ color: colors.muted, flex: 1 }}>No drafts yet. Your edits autosave here, privately.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {recent.map((p) => (
              <PressScale key={p.id} testID={`home-recent-${p.id}`} onPress={() => router.push(projectRoute(p))} style={styles.recent}>
                {p.cover ? <Image source={{ uri: photoUri(p.cover, 400) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <LinearGradient colors={["transparent", "rgba(5,5,5,0.95)"]} style={StyleSheet.absoluteFill} />
                <Text style={styles.recentName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.recentType}>{p.type.toUpperCase()} · {p.status === "draft" ? "DRAFT" : "EXPORTED"}</Text>
              </PressScale>
            ))}
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  powered: { color: colors.brand, fontSize: 11, letterSpacing: 2.5, fontWeight: "700", marginTop: 2 },
  abyaBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  hero: { marginHorizontal: spacing.lg, height: 340, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceSecondary, justifyContent: "flex-end" },
  heroBody: { padding: spacing.xl },
  kicker: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: spacing.sm },
  heroText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: 14, lineHeight: 20 },
  section: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 18, fontWeight: "700", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: spacing.lg },
  link: { color: colors.brandSecondary, fontWeight: "600", marginTop: spacing.xl, marginBottom: spacing.md },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg },
  tool: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  toolIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  toolLabel: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  toolHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  poseCard: { width: 130, height: 180, borderRadius: radius.md, overflow: "hidden", alignItems: "center", borderWidth: 1, borderColor: colors.border },
  poseName: { color: colors.onSurface, fontSize: 12, fontWeight: "600", paddingHorizontal: spacing.sm },
  emptyRecent: { marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, flexDirection: "row", gap: spacing.md, alignItems: "center" },
  recent: { width: 150, height: 190, borderRadius: radius.md, overflow: "hidden", justifyContent: "flex-end", padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  recentName: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  recentType: { color: colors.muted, fontSize: 10, marginTop: 2, letterSpacing: 1 },
});
