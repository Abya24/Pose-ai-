import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SkeletonView } from "@/src/components/Skeleton";
import { Chip, EmptyState, Icon, OutlineButton, PressScale, Title } from "@/src/components/ui";
import { CATEGORIES, POSES } from "@/src/data/poses";
import { usesNativeTabs } from "@/src/navigation";
import { poseFigures } from "@/src/pose/match";
import { colors, radius, spacing } from "@/src/theme";
import { getFavs } from "@/src/favs";
import { useSubscription } from "@/src/revenuecat";

export default function Poses() {
  const { isSubscribed } = useSubscription();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [favs, setFavs] = useState<string[]>([]);

  useFocusEffect(useCallback(() => { getFavs().then(setFavs); }, []));

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return POSES.filter((p) => (cat === "All" ? true : cat === "Favourites" ? favs.includes(p.id) : p.categories.includes(cat)))
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.categories.some((c) => c.toLowerCase().includes(s)) || p.instructions.join(" ").toLowerCase().includes(s));
  }, [q, cat, favs]);

  const cw = (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + spacing.md }}>
        <View style={styles.head}>
          <Title>Pose AI</Title>
          <View style={styles.offline}><Icon name="cloud-done-outline" size={14} color={colors.success} /><Text style={styles.offlineText}>Offline ready</Text></View>
        </View>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput testID="pose-search-input" value={q} onChangeText={setQ} placeholder="Search poses, e.g. couple, sitting" placeholderTextColor={colors.muted} style={styles.input} />
          {q ? <PressScale testID="pose-search-clear" onPress={() => setQ("")}><Icon name="close-circle" size={18} color={colors.muted} /></PressScale> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 56, flexGrow: 0 }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" }}>
          {["All", "Favourites", ...CATEGORIES].map((c) => (
            <Chip key={c} label={c} icon={c === "Favourites" ? "heart" : undefined} active={cat === c} onPress={() => setCat(c)} testID={`pose-cat-${c.toLowerCase()}`} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.sm, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + spacing.xl }}
        ListEmptyComponent={
          <EmptyState icon="body-outline" title="No poses found" text={cat === "Favourites" ? "Tap the heart on any pose to save it here." : "Try another search or category."} testID="pose-empty">
            <OutlineButton label="Reset filters" onPress={() => { setQ(""); setCat("All"); }} testID="pose-reset" />
          </EmptyState>
        }
        renderItem={({ item }) => (
          <PressScale testID={`pose-card-${item.id}`} onPress={() => router.push(`/pose/${item.id}`)} style={[styles.card, { width: cw }]}>
            <LinearGradient colors={[colors.brandTertiary, colors.surfaceSecondary]} style={StyleSheet.absoluteFill} />
            <SkeletonView persons={poseFigures(item)} width={cw} height={cw * 1.15} strokeWidth={3} />
            {favs.includes(item.id) ? <Icon name="heart" size={16} color={colors.error} style={styles.fav} /> : null}
            {item.premium ? (
              <View style={styles.pro} testID={`pose-premium-${item.id}`}>
                <Icon name={isSubscribed ? "diamond" : "lock-closed"} size={11} color={colors.onWarning} />
                <Text style={styles.proText}>{item.pack?.toUpperCase()}</Text>
              </View>
            ) : null}
            <LinearGradient colors={["transparent", colors.surface]} style={styles.scrim} />
            <View style={styles.cardBody}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>{item.categories.slice(0, 2).join(" · ")} · {item.level}</Text>
            </View>
          </PressScale>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg },
  offline: { flexDirection: "row", alignItems: "center", gap: 4 },
  offlineText: { color: colors.success, fontSize: 12, fontWeight: "600" },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 46 },
  input: { flex: 1, color: colors.onSurface, fontSize: 15 },
  card: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  fav: { position: "absolute", top: spacing.sm, right: spacing.sm },
  pro: { position: "absolute", top: spacing.sm, left: spacing.sm, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  proText: { color: colors.onWarning, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "40%" },
  cardBody: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md },
  cardName: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  cardMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
