import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getFavs, toggleFav } from "@/src/favs";
import { SkeletonView } from "@/src/components/Skeleton";
import { EmptyState, GradientButton, Icon, IconButton, OutlineButton, Title, toast } from "@/src/components/ui";
import { poseById } from "@/src/data/poses";
import { poseFigures } from "@/src/pose/match";
import { colors, radius, spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export default function PoseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pose = poseById(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [fav, setFav] = useState(false);

  useEffect(() => { getFavs().then((f) => setFav(f.includes(String(id)))); }, [id]);

  if (!pose) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EmptyState icon="alert-circle-outline" title="Pose not found" text="It may have been removed." testID="pose-not-found">
          <OutlineButton label="Back" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const useInCamera = async () => {
    await storage.setItem("pm.selectedPose", pose.id);
    router.push({ pathname: "/(tabs)/camera", params: { pose: pose.id } });
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={[styles.hero, { height: width * 1.05, paddingTop: insets.top }]}>
          <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={StyleSheet.absoluteFill} />
          <SkeletonView persons={poseFigures(pose)} width={width} height={width * 0.95} strokeWidth={5} />
          <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
            <IconButton name="chevron-back" onPress={() => router.back()} testID="pose-back" />
            <IconButton name={fav ? "heart" : "heart-outline"} testID="pose-fav-toggle" onPress={async () => {
              const f = await toggleFav(pose.id);
              setFav(f.includes(pose.id));
              toast.show(f.includes(pose.id) ? "Saved to favourites" : "Removed from favourites", "success");
            }} />
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.meta}>{pose.categories.join(" · ").toUpperCase()}</Text>
          <Title size={28} style={{ marginTop: spacing.xs }}>{pose.name}</Title>
          <Text style={styles.level}>{pose.level} · {pose.figures.length} {pose.figures.length > 1 ? "people" : "person"}</Text>

          <View style={styles.infoRow}>
            <Info icon="camera-outline" label="Camera angle" value={pose.cameraAngle} />
            <Info icon="crop-outline" label="Framing" value={pose.framing} />
          </View>

          <Text style={styles.h}>How to pose</Text>
          {pose.instructions.map((t, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <Text style={styles.stepText}>{t}</Text>
            </View>
          ))}
          <View style={styles.tip}>
            <Icon name="bulb-outline" size={18} color={colors.warning} />
            <Text style={styles.tipText}>{pose.tip}</Text>
          </View>
          <OutlineButton label="Ask ABYA about this pose" icon="sparkles" testID="pose-ask-abya" style={{ marginTop: spacing.lg }}
            onPress={() => router.push({ pathname: "/(tabs)/abya", params: { prompt: `Give me detailed tips for the "${pose.name}" pose (${pose.categories.join(", ")}): body positioning, expression, camera angle and lighting.` } })} />
        </View>
      </ScrollView>
      <View style={[styles.cta, { paddingBottom: insets.bottom + spacing.lg }]}>
        <GradientButton label="Use in Camera" icon="camera" onPress={useInCamera} testID="pose-use-camera" />
      </View>
    </View>
  );
}

function Info({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Icon name={icon} size={18} color={colors.brandSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { alignItems: "center", justifyContent: "center" },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between" },
  body: { paddingHorizontal: spacing.lg },
  meta: { color: colors.brand, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  level: { color: colors.muted, marginTop: spacing.xs },
  infoRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  info: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 4, borderWidth: 1, borderColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 11, marginTop: spacing.xs },
  infoValue: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  h: { color: colors.onSurface, fontSize: 17, fontWeight: "700", marginTop: spacing.xl, marginBottom: spacing.md },
  step: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md, alignItems: "flex-start" },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandTertiary, color: colors.onBrandTertiary, textAlign: "center", lineHeight: 26, fontWeight: "700", fontSize: 13, overflow: "hidden" },
  stepText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  tip: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  tipText: { flex: 1, color: colors.onSurfaceSecondary, lineHeight: 20 },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.scrim },
});
