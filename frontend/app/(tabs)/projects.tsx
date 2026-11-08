import { formatDistanceToNow } from "date-fns";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, photoUri, type Project } from "@/src/api";
import { EmptyState, GradientButton, Icon, OutlineButton, PressScale, Sheet, Title, toast } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { createProject, pickImages, projectRoute, uploadAssets } from "@/src/projects";
import { colors, radius, spacing } from "@/src/theme";

export default function Projects() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menu, setMenu] = useState<Project | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await api<Project[]>("/projects"));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const close = () => { setMenu(null); setRename(null); setConfirmDel(false); };

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.show(ok, "success"); close(); await load(); } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(false); }
  };

  const newPhoto = async () => {
    const a = await pickImages(false);
    if (!a.length) return;
    try {
      setBusy(true);
      const p = await createProject("photo", await uploadAssets(a));
      router.push(projectRoute(p));
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(false); }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Title>My Projects</Title>
          <View style={styles.private}><Icon name="lock-closed" size={12} color={colors.muted} /><Text style={styles.privateText}>Private to this device · autosaved</Text></View>
        </View>
      </View>
      {items === null && !error ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxl }} />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load projects" text={error} testID="projects-error">
          <OutlineButton label="Retry" icon="refresh" onPress={load} testID="projects-retry" />
        </EmptyState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.md, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + spacing.xl, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={
            <EmptyState icon="albums-outline" title="Start your first project" text="Edits, collages and carousels you create are saved here as drafts you can recover anytime." testID="projects-empty">
              <GradientButton label="Edit a photo" icon="color-wand" onPress={newPhoto} loading={busy} testID="projects-new-photo" />
            </EmptyState>
          }
          renderItem={({ item }) => (
            <PressScale testID={`project-card-${item.id}`} onPress={() => router.push(projectRoute(item))} onLongPress={() => setMenu(item)} style={styles.card}>
              {item.cover ? <Image source={{ uri: photoUri(item.cover, 500) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
              <LinearGradient colors={["transparent", "rgba(5,5,5,0.95)"]} style={styles.scrim} />
              <View style={[styles.badge, item.status === "exported" && { backgroundColor: colors.success }]}>
                <Text style={[styles.badgeText, item.status === "exported" && { color: colors.onSuccess }]}>{item.status === "draft" ? "DRAFT" : "EXPORTED"}</Text>
              </View>
              <PressScale testID={`project-menu-${item.id}`} onPress={() => setMenu(item)} style={styles.more}>
                <Icon name="ellipsis-horizontal" size={18} color={colors.onSurface} />
              </PressScale>
              <View style={styles.cardBody}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta}>{item.type[0].toUpperCase() + item.type.slice(1)} · {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}</Text>
              </View>
            </PressScale>
          )}
        />
      )}

      <Sheet visible={!!menu} onClose={close} title={menu?.name} testID="project-menu-sheet">
        {rename !== null ? (
          <View style={{ gap: spacing.md }}>
            <TextInput testID="project-rename-input" value={rename} onChangeText={setRename} autoFocus style={styles.input} placeholderTextColor={colors.muted} placeholder="Project name" />
            <GradientButton label="Save name" loading={busy} testID="project-rename-save" onPress={() => menu && act(() => api(`/projects/${menu.id}`, { method: "PATCH", body: { name: rename.trim() || menu.name } }), "Renamed")} />
          </View>
        ) : confirmDel ? (
          <View style={{ gap: spacing.md }}>
            <Text style={{ color: colors.onSurfaceSecondary }}>Delete this project? Your exported photos already saved to the gallery stay there.</Text>
            <OutlineButton danger label="Delete permanently" icon="trash" loading={busy} testID="project-delete-confirm" onPress={() => menu && act(() => api(`/projects/${menu.id}`, { method: "DELETE" }), "Project deleted")} />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {[
              { k: "open", icon: "open-outline", label: "Open", fn: () => { close(); menu && router.push(projectRoute(menu)); } },
              { k: "share", icon: "share-social-outline", label: "Export & share", fn: () => { close(); menu && router.push(`/share/${menu.id}`); } },
              { k: "rename", icon: "pencil-outline", label: "Rename", fn: () => setRename(menu?.name ?? "") },
              { k: "duplicate", icon: "copy-outline", label: "Duplicate", fn: () => menu && act(() => api(`/projects/${menu.id}/duplicate`, { method: "POST" }), "Duplicated") },
              { k: "delete", icon: "trash-outline", label: "Delete", fn: () => setConfirmDel(true) },
            ].map((o) => (
              <PressScale key={o.k} testID={`project-action-${o.k}`} onPress={o.fn} style={styles.row}>
                <Icon name={o.icon as any} size={20} color={o.k === "delete" ? colors.error : colors.onSurface} />
                <Text style={[styles.rowText, o.k === "delete" && { color: colors.error }]}>{o.label}</Text>
              </PressScale>
            ))}
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  private: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  privateText: { color: colors.muted, fontSize: 12 },
  card: { flex: 1, maxWidth: "48.5%", aspectRatio: 0.8, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  badge: { position: "absolute", top: spacing.sm, left: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  more: { position: "absolute", top: 4, right: 4, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  cardBody: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md },
  name: { color: colors.onSurface, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, height: 52, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  rowText: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  input: { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 50, fontSize: 16 },
});
