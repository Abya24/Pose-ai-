import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, photoUri, type Photo, type Project } from "@/src/api";
import { Chip, GradientButton, Icon, IconButton, OutlineButton, PressScale, Sheet, Title, toast, type IconName } from "@/src/components/ui";
import { Row } from "@/src/components/Row";
import { STICKERS, SWATCHES } from "@/src/presets";
import { pickImages, uploadAssets } from "@/src/projects";
import { ASPECT_RATIO, TEMPLATES, buildTemplate, eid, type Canvas, type El } from "@/src/templates";
import { colors, radius, spacing } from "@/src/theme";

const BGS: { bg: string; bg2?: string }[] = [
  { bg: "#FFFFFF" }, { bg: "#F4F1EC" }, { bg: "#EDE7DF" }, { bg: "#050505" }, { bg: "#1F1F24" }, { bg: "#F8F3EC" },
  { bg: "#651FFF", bg2: "#2979FF" }, { bg: "#FF8A65", bg2: "#F8BBD0" }, { bg: "#0F2027", bg2: "#2C5364" },
];

function ElementView({ el, W, H, selected, onSelect, onMove, snapLines }: {
  el: El; W: number; H: number; selected: boolean; onSelect: () => void;
  onMove: (x: number, y: number, done: boolean, guides: { v: number[]; h: number[] }) => void; snapLines: number[];
}) {
  const ref = useRef({ el, W, H, onSelect, onMove, snapLines });
  ref.current = { el, W, H, onSelect, onMove, snapLines };
  const start = useRef({ x: 0, y: 0 });
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = { x: ref.current.el.x, y: ref.current.el.y }; ref.current.onSelect(); },
    onPanResponderMove: (_, g) => {
      const { el: e, W: w, H: h, snapLines: lines } = ref.current;
      let x = start.current.x + g.dx / w, y = start.current.y + g.dy / h;
      const center = e.type === "sticker" ? 0 : e.w / 2;
      const centerY = e.type === "sticker" ? 0 : e.h / 2;
      const guides = { v: [] as number[], h: [] as number[] };
      for (const l of lines) {
        if (Math.abs(x + center - l) < 0.012) { x = l - center; guides.v.push(l); break; }
        if (e.type !== "sticker" && Math.abs(x - l) < 0.008) { x = l; guides.v.push(l); break; }
        if (e.type !== "sticker" && Math.abs(x + e.w - l) < 0.008) { x = l - e.w; guides.v.push(l); break; }
      }
      if (Math.abs(y + centerY - 0.5) < 0.012) { y = 0.5 - centerY; guides.h.push(0.5); }
      ref.current.onMove(x, y, false, guides);
    },
    onPanResponderRelease: () => ref.current.onMove(ref.current.el.x, ref.current.el.y, true, { v: [], h: [] }),
  }), []);

  const common = { position: "absolute" as const, transform: [{ rotate: `${el.rot}deg` }] };
  if (el.type === "image") {
    const b = (el.border || 0) * W;
    return (
      <View {...pan.panHandlers} testID={`canvas-el-${el.id}`} style={[common, { left: el.x * W, top: el.y * H, width: el.w * W, height: el.h * H, padding: b, backgroundColor: b ? el.borderColor : undefined, borderRadius: (el.radius || 0) * W, overflow: "hidden" }, selected && styles.selected]}>
        {el.photo_id ? <Image source={{ uri: photoUri(el.photo_id, 900) }} style={{ flex: 1 }} contentFit="cover" /> : null}
      </View>
    );
  }
  const fs = (el.size || 0.05) * H;
  if (el.type === "sticker") {
    const box = fs * 1.4;
    return (
      <View {...pan.panHandlers} testID={`canvas-el-${el.id}`} style={[common, { left: el.x * W - box / 2, top: el.y * H - box / 2, width: box, height: box, alignItems: "center", justifyContent: "center" }, selected && styles.selected]}>
        <Text style={{ fontSize: fs, color: el.color, lineHeight: fs * 1.2 }}>{el.glyph}</Text>
      </View>
    );
  }
  return (
    <View {...pan.panHandlers} testID={`canvas-el-${el.id}`} style={[common, { left: el.x * W, top: el.y * H }, selected && styles.selected]}>
      <Text style={{ fontFamily: "SpaceGrotesk", fontWeight: "700", fontSize: fs, lineHeight: fs * 1.2, color: el.color, textAlign: el.align || "left" }}>{el.text}</Text>
    </View>
  );
}

function PageView({ canvas, page, W, H, selId, onSelect, onMove, guides, interactive = true }: any) {
  const pg = canvas.pages[page];
  const lines = [0.5, ...Array.from({ length: canvas.slides + 1 }, (_: any, i: number) => i / canvas.slides), ...Array.from({ length: canvas.slides }, (_: any, i: number) => (i + 0.5) / canvas.slides)];
  return (
    <Pressable onPress={() => onSelect?.(null)} style={{ width: W, height: H, backgroundColor: pg.bg, overflow: "hidden" }} testID="canvas-page">
      {pg.bg2 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: pg.bg2, opacity: 0.5 }]} /> : null}
      {pg.elements.map((el: El) => interactive ? (
        <ElementView key={el.id} el={el} W={W} H={H} selected={selId === el.id} onSelect={() => onSelect(el.id)} onMove={(x, y, d, g) => onMove(el.id, x, y, d, g)} snapLines={lines} />
      ) : (
        <ElementView key={el.id} el={el} W={W} H={H} selected={false} onSelect={() => {}} onMove={() => {}} snapLines={[]} />
      ))}
      {canvas.mode === "carousel" && interactive ? Array.from({ length: canvas.slides - 1 }, (_, i) => (
        <View key={i} pointerEvents="none" style={[styles.seam, { left: ((i + 1) / canvas.slides) * W }]} />
      )) : null}
      {guides?.v.map((v: number, i: number) => <View key={`gv${i}`} pointerEvents="none" style={[styles.guideV, { left: v * W }]} />)}
      {guides?.h.map((h: number, i: number) => <View key={`gh${i}`} pointerEvents="none" style={[styles.guideH, { top: h * H }]} />)}
    </Pressable>
  );
}

export default function Studio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [project, setProject] = useState<Project | null>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [past, setPast] = useState<Canvas[]>([]);
  const [page, setPage] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState<null | "templates" | "stickers" | "bg" | "layers">(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const dragBase = useRef<Canvas | null>(null);

  useEffect(() => {
    api<Project>(`/projects/${id}`).then((p) => {
      setProject(p);
      setCanvas(p.canvas || buildTemplate(p.type === "carousel" ? "seamless" : "grid", p.photos, p.type === "carousel" ? "carousel" : "collage"));
    }).catch((e) => toast.show(e.message, "error"));
  }, [id]);

  useEffect(() => {
    if (!project || !canvas) return;
    setSaved(false);
    const t = setTimeout(() => api(`/projects/${id}`, { method: "PATCH", body: { canvas, photos: project.photos } }).then(() => setSaved(true)).catch(() => {}), 900);
    return () => clearTimeout(t);
  }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project || !canvas) return <View style={[styles.root, styles.center]}><ActivityIndicator color={colors.brand} /></View>;

  const ratio = ASPECT_RATIO[canvas.aspect];
  const carousel = canvas.mode === "carousel";
  const maxH = height - insets.top - insets.bottom - 330;
  let H = Math.min(maxH, (width - 32) / ratio);
  if (carousel) H = Math.min(maxH, (width - 64) / ratio);
  const slideW = H * ratio;
  const W = carousel ? slideW * canvas.slides : slideW;

  const commit = (c: Canvas) => { setPast((p) => [...p.slice(-30), canvas]); setCanvas(c); };
  const els = canvas.pages[page]?.elements || [];
  const sel = els.find((e) => e.id === selId) || null;
  const updateEls = (fn: (els: El[]) => El[], push = true) => {
    const next = { ...canvas, pages: canvas.pages.map((p, i) => (i === page ? { ...p, elements: fn(p.elements) } : p)) };
    if (push) commit(next); else setCanvas(next);
  };
  const updateSel = (patch: Partial<El>, push = false) => sel && updateEls((e) => e.map((x) => (x.id === sel.id ? { ...x, ...patch } : x)), push);
  const onMove = (eidv: string, x: number, y: number, done: boolean, g: any) => {
    if (!dragging) { dragBase.current = canvas; setDragging(true); }
    if (done) {
      setDragging(false); setGuides({ v: [], h: [] });
      if (dragBase.current) { const b = dragBase.current; setPast((p) => [...p.slice(-30), b]); dragBase.current = null; }
      return;
    }
    setGuides(g);
    updateEls((e) => e.map((el) => (el.id === eidv ? { ...el, x, y } : el)), false);
  };

  const addPhotos = async () => {
    const a = await pickImages(true);
    if (!a.length) return;
    setBusy("photos");
    try {
      const ids = await uploadAssets(a);
      const photos = [...project.photos, ...ids];
      setProject({ ...project, photos });
      const sw = carousel ? 1 / canvas.slides : 1;
      updateEls((e) => [...e, ...ids.map((p, i) => ({ id: eid(), type: "image" as const, photo_id: p, x: sw * 0.2 + i * 0.03, y: 0.25 + i * 0.03, w: sw * 0.6, h: 0.45, rot: 0 }))]);
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(null); }
  };

  const setSlides = (n: number) => {
    if (n < 2 || n > 10) return;
    const k = canvas.slides / n;
    commit({ ...canvas, slides: n, pages: canvas.pages.map((p) => ({ ...p, elements: p.elements.map((e) => ({ ...e, x: e.x * k, w: e.w * k })) })) });
  };

  const exportCanvas = async () => {
    setBusy("export");
    try {
      const r = await api<{ photos: Photo[] }>("/compose/render", { body: { canvas } });
      const ids = r.photos.map((p) => p.id);
      await api(`/projects/${id}`, { method: "PATCH", body: { canvas, exports: ids, status: "exported", cover: ids[0] } });
      router.push(`/share/${id}`);
    } catch (e: any) { toast.show(e.message || "Export failed", "error"); } finally { setBusy(null); }
  };

  const tools: { k: string; label: string; icon: IconName; fn: () => void }[] = [
    { k: "templates", label: "Templates", icon: "grid-outline", fn: () => setSheet("templates") },
    { k: "photos", label: "Photos", icon: "images-outline", fn: addPhotos },
    { k: "text", label: "Text", icon: "text-outline", fn: () => { const e: El = { id: eid(), type: "text", text: "Your text", x: carousel ? 0.05 / canvas.slides : 0.1, y: 0.45, w: 0.5, h: 0.08, rot: 0, size: 0.06, color: canvas.pages[page].bg === "#050505" ? "#FFFFFF" : "#050505" }; updateEls((x) => [...x, e]); setSelId(e.id); } },
    { k: "stickers", label: "Stickers", icon: "star-outline", fn: () => setSheet("stickers") },
    { k: "bg", label: "Background", icon: "color-palette-outline", fn: () => setSheet("bg") },
    { k: "layers", label: "Layers", icon: "layers-outline", fn: () => setSheet("layers") },
  ];

  return (
    <View style={styles.root} testID="studio-screen">
      <View style={[styles.head, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="chevron-back" onPress={() => router.back()} testID="studio-back" />
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={styles.title} numberOfLines={1}>{project.name}</Text>
          <Text style={styles.saved} testID="studio-save-status">{saved ? "Saved" : "Saving…"} · {carousel ? `${canvas.slides} slides` : `Page ${page + 1}/${canvas.pages.length}`}</Text>
        </View>
        <IconButton name="arrow-undo" testID="studio-undo" style={{ opacity: past.length ? 1 : 0.4 }} onPress={() => { if (past.length) { setCanvas(past[past.length - 1]); setPast((p) => p.slice(0, -1)); } }} />
        <IconButton name="eye-outline" testID="studio-preview" onPress={() => setPreview(true)} />
        <PressScale testID="studio-export" onPress={exportCanvas} disabled={!!busy} style={styles.next}>
          {busy === "export" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.nextText}>Export</Text>}
        </PressScale>
      </View>

      <View style={styles.stage}>
        <ScrollView horizontal scrollEnabled={!dragging} showsHorizontalScrollIndicator={carousel} contentContainerStyle={{ paddingHorizontal: (width - Math.min(W, width - 32)) / 2, alignItems: "center" }}>
          <PageView canvas={canvas} page={page} W={W} H={H} selId={selId} onSelect={setSelId} onMove={onMove} guides={guides} />
        </ScrollView>
      </View>

      <View style={styles.pageRow}>
        {carousel ? (
          <>
            <Text style={styles.pageLabel}>Slides</Text>
            <IconButton name="remove" testID="studio-slides-minus" onPress={() => setSlides(canvas.slides - 1)} />
            <Text style={styles.pageNum} testID="studio-slide-count">{canvas.slides}</Text>
            <IconButton name="add" testID="studio-slides-plus" onPress={() => setSlides(canvas.slides + 1)} />
          </>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, alignItems: "center" }}>
            {canvas.pages.map((_, i) => <Chip key={i} label={`Page ${i + 1}`} active={page === i} onPress={() => { setPage(i); setSelId(null); }} testID={`studio-page-${i}`} />)}
            <Chip label="+ Page" testID="studio-add-page" onPress={() => { commit({ ...canvas, pages: [...canvas.pages, { bg: "#FFFFFF", elements: [] }] }); setPage(canvas.pages.length); }} />
            {canvas.pages.length > 1 ? <Chip label="Delete page" testID="studio-delete-page" onPress={() => { commit({ ...canvas, pages: canvas.pages.filter((_, i) => i !== page) }); setPage(0); }} /> : null}
          </ScrollView>
        )}
        <View style={{ flex: carousel ? 1 : 0 }} />
        {(["4:5", "1:1", "9:16"] as const).map((a) => <Chip key={a} label={a} active={canvas.aspect === a} onPress={() => commit({ ...canvas, aspect: a })} testID={`studio-aspect-${a}`} />)}
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.sm }]}>
        {sel ? (
          <ScrollView>
            <View style={styles.selHead}>
              <Text style={styles.selTitle}>{sel.type === "image" ? "Photo" : sel.type === "text" ? "Text" : "Sticker"}</Text>
              <IconButton name="arrow-up" testID="el-forward" onPress={() => updateEls((e) => { const i = e.findIndex((x) => x.id === sel.id); const c = [...e]; if (i < c.length - 1) [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c; })} />
              <IconButton name="arrow-down" testID="el-backward" onPress={() => updateEls((e) => { const i = e.findIndex((x) => x.id === sel.id); const c = [...e]; if (i > 0) [c[i], c[i - 1]] = [c[i - 1], c[i]]; return c; })} />
              <IconButton name="copy-outline" testID="el-duplicate" onPress={() => updateEls((e) => [...e, { ...sel, id: eid(), x: sel.x + 0.03, y: sel.y + 0.03 }])} />
              <IconButton name="trash-outline" testID="el-delete" onPress={() => { updateEls((e) => e.filter((x) => x.id !== sel.id)); setSelId(null); }} />
              <IconButton name="checkmark" testID="el-done" onPress={() => setSelId(null)} />
            </View>
            {sel.type === "text" ? <TextInput testID="el-text-input" value={sel.text} onChangeText={(t) => updateSel({ text: t })} multiline style={styles.input} placeholderTextColor={colors.muted} /> : null}
            {sel.type === "image" ? (
              <>
                <Row label="Size" min={0.1} max={carousel ? 1.5 : 1.2} step={0.01} value={sel.w / (carousel ? 1 / canvas.slides : 1)} onChange={(v) => { const sw = carousel ? 1 / canvas.slides : 1; const k = (v * sw) / sel.w; updateSel({ w: sel.w * k, h: sel.h * k }); }} testID="el-size" />
                <Row label="Height" min={0.1} max={1} step={0.01} value={sel.h} onChange={(v) => updateSel({ h: v })} />
                <Row label="Border" min={0} max={0.04} step={0.001} value={sel.border || 0} onChange={(v) => updateSel({ border: v, borderColor: sel.borderColor || "#FFFFFF" })} />
                <Row label="Corners" min={0} max={0.1} step={0.002} value={sel.radius || 0} onChange={(v) => updateSel({ radius: v })} />
              </>
            ) : (
              <Row label="Size" min={0.02} max={0.3} step={0.005} value={sel.size || 0.05} onChange={(v) => updateSel({ size: v })} testID="el-size" />
            )}
            <Row label="Rotate" min={-45} max={45} step={1} value={sel.rot} onChange={(v) => updateSel({ rot: v })} testID="el-rotate" />
            <View style={styles.swatches}>
              {SWATCHES.map((c) => <PressScale key={c} onPress={() => updateSel(sel.type === "image" ? { borderColor: c, border: sel.border || 0.01 } : { color: c }, true)} style={[styles.swatch, { backgroundColor: c }]} />)}
            </View>
          </ScrollView>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
              {tools.map((t) => (
                <PressScale key={t.k} testID={`studio-tool-${t.k}`} onPress={t.fn} style={styles.tool}>
                  {busy === t.k ? <ActivityIndicator color={colors.brand} /> : <Icon name={t.icon} size={22} color={colors.onSurface} />}
                  <Text style={styles.toolText}>{t.label}</Text>
                </PressScale>
              ))}
            </ScrollView>
            <Row label="Spacing" min={0} max={0.06} step={0.002} value={canvas.spacing} testID="studio-spacing"
              onChange={(v) => setCanvas(canvas.template === "grid" && !carousel ? { ...buildTemplate("grid", project.photos, "collage", v), aspect: canvas.aspect, pages: canvas.pages.map((p, i) => (i === page ? { ...p, elements: buildTemplate("grid", project.photos, "collage", v).pages[0].elements } : p)) } : { ...canvas, spacing: v })} />
            <Text style={styles.hint}>Drag items to move · tap to resize, rotate, layer · guides snap to centres{carousel ? " and slide seams" : ""}</Text>
          </>
        )}
      </View>

      <Sheet visible={sheet === "templates"} onClose={() => setSheet(null)} title="Templates" testID="studio-templates-sheet">
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: spacing.sm }}>
          {TEMPLATES.filter((t) => t.mode === canvas.mode).map((t) => (
            <PressScale key={t.key} testID={`template-${t.key}`} style={styles.tplRow} onPress={() => { commit({ ...buildTemplate(t.key, project.photos, canvas.mode, canvas.spacing, carousel ? canvas.slides : undefined), aspect: canvas.aspect }); setPage(0); setSelId(null); setSheet(null); }}>
              <Icon name={carousel ? "albums-outline" : "grid-outline"} size={20} color={colors.brand} />
              <View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "700" }}>{t.label}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{t.theme}</Text></View>
              {canvas.template === t.key ? <Icon name="checkmark-circle" size={20} color={colors.success} /> : null}
            </PressScale>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet visible={sheet === "stickers"} onClose={() => setSheet(null)} title="Stickers" testID="studio-stickers-sheet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {STICKERS.map((g) => (
            <PressScale key={g} testID={`studio-sticker-${g}`} style={styles.stk} onPress={() => { const e: El = { id: eid(), type: "sticker", glyph: g, x: carousel ? 0.5 / canvas.slides : 0.5, y: 0.5, w: 0.1, h: 0.1, rot: 0, size: 0.1, color: "#651FFF" }; updateEls((x) => [...x, e]); setSelId(e.id); setSheet(null); }}>
              <Text style={{ fontSize: 26, color: colors.onSurface }}>{g}</Text>
            </PressScale>
          ))}
        </View>
      </Sheet>

      <Sheet visible={sheet === "bg"} onClose={() => setSheet(null)} title="Background" testID="studio-bg-sheet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {BGS.map((b, i) => (
            <PressScale key={i} testID={`studio-bg-${i}`} onPress={() => commit({ ...canvas, pages: canvas.pages.map((p, j) => (j === page ? { ...p, bg: b.bg, bg2: b.bg2 } : p)) })} style={[styles.bgSw, { backgroundColor: b.bg }]}>
              {b.bg2 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: b.bg2, opacity: 0.5, borderRadius: radius.md }]} /> : null}
            </PressScale>
          ))}
        </View>
      </Sheet>

      <Sheet visible={sheet === "layers"} onClose={() => setSheet(null)} title="Layers (top first)" testID="studio-layers-sheet">
        <ScrollView style={{ maxHeight: 400 }}>
          {[...els].reverse().map((e) => (
            <PressScale key={e.id} testID={`layer-${e.id}`} onPress={() => { setSelId(e.id); setSheet(null); }} style={styles.tplRow}>
              {e.type === "image" && e.photo_id ? <Image source={{ uri: photoUri(e.photo_id, 120) }} style={{ width: 40, height: 40, borderRadius: radius.sm }} /> : <Icon name={e.type === "text" ? "text" : "star"} size={20} color={colors.onSurface} />}
              <Text style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>{e.type === "image" ? "Photo" : e.text || e.glyph}</Text>
            </PressScale>
          ))}
          {!els.length ? <Text style={{ color: colors.muted }}>No layers yet.</Text> : null}
        </ScrollView>
      </Sheet>

      <Modal visible={preview} animationType="fade" onRequestClose={() => setPreview(false)}>
        <View style={[styles.root, { paddingTop: insets.top + spacing.md }]} testID="studio-preview-modal">
          <View style={styles.selHead}>
            <Title size={20} style={{ flex: 1, marginLeft: spacing.lg }}>{carousel ? "Carousel preview" : "Preview"}</Title>
            <IconButton name="close" onPress={() => setPreview(false)} testID="studio-preview-close" />
          </View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {(carousel ? Array.from({ length: canvas.slides }, (_, i) => ({ pg: 0, slide: i })) : canvas.pages.map((_, i) => ({ pg: i, slide: 0 }))).map(({ pg, slide }) => {
              const sw = width - 32, sh = sw / ratio;
              return (
                <View key={`${pg}-${slide}`} style={{ width, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: sw, height: sh, overflow: "hidden", borderRadius: radius.sm }}>
                    <View style={{ marginLeft: -slide * sw }}>
                      <PageView canvas={canvas} page={pg} W={carousel ? sw * canvas.slides : sw} H={sh} interactive={false} />
                    </View>
                  </View>
                  <Text style={{ color: colors.muted, marginTop: spacing.md }}>{carousel ? `Slide ${slide + 1} of ${canvas.slides}` : `Page ${pg + 1}`} · swipe</Text>
                </View>
              );
            })}
          </ScrollView>
          <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.sm }}>
            <GradientButton label={carousel ? "Export slides in order" : "Export"} icon="download-outline" loading={busy === "export"} onPress={() => { setPreview(false); exportCanvas(); }} testID="studio-preview-export" />
            <OutlineButton label="Keep editing" onPress={() => setPreview(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  saved: { color: colors.muted, fontSize: 11 },
  next: { height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  nextText: { color: colors.onBrandPrimary, fontWeight: "700" },
  stage: { flex: 1, justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  selected: { borderWidth: 2, borderColor: colors.brandSecondary },
  seam: { position: "absolute", top: 0, bottom: 0, width: 1, borderLeftWidth: 1, borderColor: colors.brandPrimary, borderStyle: "dashed" },
  guideV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.error },
  guideH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.error },
  pageRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, height: 56 },
  pageLabel: { color: colors.muted, fontSize: 12 },
  pageNum: { color: colors.onSurface, fontWeight: "700", minWidth: 20, textAlign: "center" },
  panel: { height: 240, backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md },
  tool: { width: 74, alignItems: "center", gap: 4, paddingVertical: spacing.sm },
  toolText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600" },
  hint: { color: colors.muted, fontSize: 11, marginTop: spacing.sm },
  selHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  selTitle: { color: colors.onSurface, fontWeight: "700", flex: 1 },
  input: { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.sm, minHeight: 44 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.borderStrong },
  tplRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, marginBottom: spacing.sm },
  stk: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  bgSw: { width: 56, height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
});
