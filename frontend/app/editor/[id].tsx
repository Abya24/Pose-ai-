import { Image } from "expo-image";

import { Row } from "@/src/components/Row";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, photoUri, type Photo, type Project } from "@/src/api";
import { Chip, GradientButton, Icon, IconButton, OutlineButton, PressScale, Sheet, toast, type IconName } from "@/src/components/ui";
import { ADJUSTMENTS, ASPECTS, BUILTIN_PRESETS, FILTERS, FRAMES, STICKERS, SWATCHES, type AdjustKey, type EditParams, type Preset } from "@/src/presets";
import { colors, radius, spacing } from "@/src/theme";

type Doc = { photos: string[]; edits: Record<string, EditParams> };
type Tool = "adjust" | "filters" | "presets" | "crop" | "text" | "stickers" | "frames" | "ai";
const TOOLS: { key: Tool; label: string; icon: IconName }[] = [
  { key: "adjust", label: "Adjust", icon: "options-outline" },
  { key: "filters", label: "Filters", icon: "color-filter-outline" },
  { key: "presets", label: "Presets", icon: "bookmarks-outline" },
  { key: "crop", label: "Crop", icon: "crop-outline" },
  { key: "ai", label: "AI", icon: "sparkles-outline" },
  { key: "text", label: "Text", icon: "text-outline" },
  { key: "stickers", label: "Stickers", icon: "star-outline" },
  { key: "frames", label: "Frames", icon: "square-outline" },
];

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState<Project | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc>({ photos: [], edits: {} });
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const base = useRef<Doc | null>(null);
  const [sel, setSel] = useState(0);
  const [tool, setTool] = useState<Tool>("adjust");
  const [adjKey, setAdjKey] = useState<AdjustKey>("exposure");
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [saved, setSaved] = useState(true);
  const [custom, setCustom] = useState<Preset[]>([]);
  const [applyAll, setApplyAll] = useState(false);
  const [presetName, setPresetName] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [bgPrompt, setBgPrompt] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [newText, setNewText] = useState("");
  const [selText, setSelText] = useState(-1);
  const [selStk, setSelStk] = useState(-1);
  const [exporting, setExporting] = useState(false);
  const req = useRef(0);

  const load = async () => {
    try {
      setLoadErr(null);
      const p = await api<Project>(`/projects/${id}`);
      setProject(p);
      setDoc({ photos: p.photos, edits: p.edits || {} });
    } catch (e: any) { setLoadErr(e.message); }
  };
  useEffect(() => { load(); api<any[]>("/presets").then((x) => setCustom(x.map((p) => ({ ...p, group: "Custom" })))).catch(() => {}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pid = doc.photos[sel];
  const params: EditParams = (pid && doc.edits[pid]) || {};
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    if (!pid) return;
    const t = setTimeout(async () => {
      const my = ++req.current;
      setRendering(true);
      try {
        const r = await api<{ image: string }>("/edit/render", { body: { photo_id: pid, params, preview: true } });
        if (my === req.current) { setPreview(r.image); setRenderErr(null); }
      } catch (e: any) { if (my === req.current) setRenderErr(e.message); }
      finally { if (my === req.current) setRendering(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [pid, paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave (non-destructive: only parameters are stored, originals stay untouched).
  useEffect(() => {
    if (!project) return;
    setSaved(false);
    const t = setTimeout(() => {
      api(`/projects/${id}`, { method: "PATCH", body: { photos: doc.photos, edits: doc.edits, cover: doc.photos[0] } }).then(() => setSaved(true)).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: Doc) => { setPast((p) => [...p.slice(-40), doc]); setFuture([]); setDoc(next); };
  const setParams = (fn: (p: EditParams) => EditParams, push = true, all = false) => {
    const edits = { ...doc.edits };
    (all ? doc.photos : [pid]).forEach((ph) => { edits[ph] = fn(edits[ph] || {}); });
    const next = { ...doc, edits };
    if (push) commit(next); else setDoc(next);
  };
  const startDrag = () => { base.current = doc; };
  const endDrag = () => { if (base.current) { setPast((p) => [...p.slice(-40), base.current!]); setFuture([]); base.current = null; } };
  const undo = () => { if (!past.length) return; setFuture((f) => [doc, ...f]); setDoc(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, doc]); setDoc(future[0]); setFuture((f) => f.slice(1)); };

  const adj = params.adjust || {};
  const crop = params.crop || { aspect: "original", zoom: 1, cx: 0.5, cy: 0.5 };

  const applyPreset = (pr: Preset) => {
    setParams((p) => ({ ...p, filter: pr.params.filter, adjust: { ...(pr.params.adjust || {}) } }), true, applyAll);
    toast.show(applyAll ? `${pr.name} applied to ${doc.photos.length} photos` : `${pr.name} applied`, "success");
  };

  const savePreset = async () => {
    try {
      const p = await api<Preset>("/presets", { body: { name: presetName, params: { filter: params.filter || "none", adjust: params.adjust || {} } } });
      setCustom((c) => [{ ...p, group: "Custom" }, ...c]);
      setPresetName(null);
      toast.show("Preset saved", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const runAI = async (mode: string) => {
    if (mode === "replace_bg" && !bgPrompt.trim()) { toast.show("Describe the new background first", "info"); return; }
    setAiBusy(mode);
    try {
      if (mode === "suggest") {
        const r = await api<any>("/edit/suggest", { body: { photo_id: pid } });
        setParams((p) => ({ ...p, adjust: { ...(r.adjust || {}) }, filter: r.filter || p.filter, crop: r.crop_aspect && r.crop_aspect !== "original" ? { ...crop, aspect: r.crop_aspect } : p.crop }));
        setReasons(r.reasons || []);
        toast.show("Smart suggestions applied — undo anytime", "success");
      } else {
        const ph = await api<Photo>("/ai/process", { body: { photo_id: pid, mode, prompt: bgPrompt } });
        const photos = doc.photos.map((x, i) => (i === sel ? ph.id : x));
        commit({ photos, edits: { ...doc.edits, [ph.id]: doc.edits[pid] || {} } });
        toast.show("AI result ready — undo to go back to the original", "success");
      }
    } catch (e: any) { toast.show(e.message || "AI processing failed", "error"); }
    finally { setAiBusy(null); }
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const out: string[] = [];
      for (const ph of doc.photos) {
        const r = await api<Photo>("/edit/render", { body: { photo_id: ph, params: doc.edits[ph] || {}, preview: false } });
        out.push(r.id);
      }
      await api(`/projects/${id}`, { method: "PATCH", body: { photos: doc.photos, edits: doc.edits, exports: out, status: "exported", cover: out[0] } });
      router.push(`/share/${id}`);
    } catch (e: any) { toast.show(e.message || "Export failed", "error"); }
    finally { setExporting(false); }
  };

  if (loadErr) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={{ color: colors.onSurface, marginBottom: spacing.lg }}>{loadErr}</Text>
        <OutlineButton label="Retry" icon="refresh" onPress={load} testID="editor-retry" />
      </View>
    );
  }
  if (!project) return <View style={[styles.root, styles.center]}><ActivityIndicator color={colors.brand} /></View>;

  const texts = params.texts || [];
  const stickers = params.stickers || [];
  const groups = [...new Set([...BUILTIN_PRESETS, ...custom].map((p) => p.group))];

  return (
    <View style={styles.root} testID="editor-screen">
      <View style={[styles.head, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="chevron-back" onPress={() => router.back()} testID="editor-back" />
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={styles.title} numberOfLines={1}>{project.name}</Text>
          <Text style={styles.saved} testID="editor-save-status">{saved ? "Saved" : "Saving…"}</Text>
        </View>
        <IconButton name="arrow-undo" onPress={undo} testID="editor-undo" style={{ opacity: past.length ? 1 : 0.4 }} />
        <IconButton name="arrow-redo" onPress={redo} testID="editor-redo" style={{ opacity: future.length ? 1 : 0.4 }} />
        <PressScale testID="editor-next" onPress={exportAll} disabled={exporting} style={styles.next}>
          {exporting ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.nextText}>Next</Text>}
        </PressScale>
      </View>

      <View style={styles.previewWrap}>
        {compare && pid ? (
          <Image source={{ uri: photoUri(pid, 1080) }} style={styles.preview} contentFit="contain" testID="editor-original" />
        ) : preview ? (
          <Image source={{ uri: preview }} style={styles.preview} contentFit="contain" testID="editor-preview" />
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
        {rendering || aiBusy ? <View style={styles.busy}><ActivityIndicator color={colors.onSurface} /><Text style={styles.busyText}>{aiBusy ? "AI is processing (10–40s)…" : "Rendering"}</Text></View> : null}
        {renderErr ? <Text style={styles.err}>{renderErr}</Text> : null}
        <Pressable testID="editor-compare" onPressIn={() => setCompare(true)} onPressOut={() => setCompare(false)} style={styles.compare}>
          <Icon name="git-compare-outline" size={16} color={colors.onSurface} />
          <Text style={styles.compareText}>{compare ? "Before" : "Hold: before"}</Text>
        </Pressable>
      </View>

      {doc.photos.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.strip}>
          {doc.photos.map((ph, i) => (
            <PressScale key={ph + i} testID={`editor-photo-${i}`} onPress={() => setSel(i)} style={[styles.thumb, i === sel && { borderColor: colors.brandPrimary }]}>
              <Image source={{ uri: photoUri(ph, 200) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              {doc.edits[ph] && Object.keys(doc.edits[ph]).length ? <View style={styles.editedDot} /> : null}
            </PressScale>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.panel} testID={`editor-panel-${tool}`}>
        {tool === "adjust" ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 56 }} contentContainerStyle={styles.chips}>
              {ADJUSTMENTS.map((a) => <Chip key={a.key} label={a.label + (adj[a.key] ? " •" : "")} active={adjKey === a.key} onPress={() => setAdjKey(a.key)} testID={`adjust-${a.key}`} />)}
            </ScrollView>
            {(() => {
              const a = ADJUSTMENTS.find((x) => x.key === adjKey)!;
              return <Row testID="adjust-slider" label={a.label} min={a.min} max={a.max} value={adj[a.key] ?? 0} onStart={startDrag} onDone={endDrag}
                onChange={(v) => setParams((p) => ({ ...p, adjust: { ...(p.adjust || {}), [a.key]: Math.round(v) } }), false)} />;
            })()}
            <PressScale testID="adjust-reset" onPress={() => setParams((p) => ({ ...p, adjust: {} }))} style={styles.link}><Text style={styles.linkText}>Reset adjustments</Text></PressScale>
          </>
        ) : null}

        {tool === "filters" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {FILTERS.map((f) => <Chip key={f} label={f === "none" ? "Original" : f[0].toUpperCase() + f.slice(1)} active={(params.filter || "none") === f} onPress={() => setParams((p) => ({ ...p, filter: f }))} testID={`filter-${f}`} />)}
          </ScrollView>
        ) : null}

        {tool === "presets" ? (
          <ScrollView>
            {doc.photos.length > 1 ? (
              <PressScale testID="preset-apply-all" onPress={() => setApplyAll(!applyAll)} style={styles.toggle}>
                <Icon name={applyAll ? "checkbox" : "square-outline"} size={20} color={applyAll ? colors.brand : colors.muted} />
                <Text style={{ color: colors.onSurface }}>Batch: apply to all {doc.photos.length} photos (fine-tune each after)</Text>
              </PressScale>
            ) : null}
            {groups.map((g) => (
              <View key={g} style={{ marginBottom: spacing.sm }}>
                <Text style={styles.group}>{g}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {[...BUILTIN_PRESETS, ...custom].filter((p) => p.group === g).map((p) => (
                    <Chip key={p.id} label={p.name} onPress={() => applyPreset(p)} testID={`preset-${p.id}`} />
                  ))}
                </ScrollView>
              </View>
            ))}
            <PressScale testID="preset-save-open" onPress={() => setPresetName("My look")} style={styles.link}><Text style={styles.linkText}>+ Save current look as preset</Text></PressScale>
          </ScrollView>
        ) : null}

        {tool === "crop" ? (
          <ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 56 }} contentContainerStyle={styles.chips}>
              {ASPECTS.map((a) => <Chip key={a} label={a === "original" ? "Original" : a} active={crop.aspect === a} onPress={() => setParams((p) => ({ ...p, crop: { ...crop, aspect: a } }))} testID={`crop-${a}`} />)}
            </ScrollView>
            <View style={styles.btnRow}>
              <IconButton name="refresh" label="90°" testID="crop-rotate" onPress={() => setParams((p) => ({ ...p, rotate: ((p.rotate || 0) + 90) % 360 }))} />
              <IconButton name="swap-horizontal" label="Flip H" testID="crop-flip-h" active={!!params.flipH} onPress={() => setParams((p) => ({ ...p, flipH: !p.flipH }))} />
              <IconButton name="swap-vertical" label="Flip V" testID="crop-flip-v" active={!!params.flipV} onPress={() => setParams((p) => ({ ...p, flipV: !p.flipV }))} />
            </View>
            <Row label="Straighten" min={-15} max={15} step={0.5} value={params.straighten || 0} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, straighten: v }), false)} testID="crop-straighten" />
            <Row label="Zoom" min={1} max={3} step={0.05} value={crop.zoom} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, crop: { ...crop, zoom: v } }), false)} testID="crop-zoom" />
            <Row label="Move X" min={0} max={1} step={0.01} value={crop.cx} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, crop: { ...crop, cx: v } }), false)} />
            <Row label="Move Y" min={0} max={1} step={0.01} value={crop.cy} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, crop: { ...crop, cy: v } }), false)} />
          </ScrollView>
        ) : null}

        {tool === "ai" ? (
          <ScrollView>
            <View style={styles.notice}>
              <Icon name="wifi" size={14} color={colors.info} />
              <Text style={styles.noticeText}>AI tools need internet. Tapping one sends this photo to Google Gemini through PoseMate&apos;s server; results take 10–40s. Noise reduction & sharpening run locally in Adjust.</Text>
            </View>
            <View style={styles.aiGrid}>
              {[
                { k: "suggest", label: "Smart suggestions", icon: "bulb-outline" },
                { k: "enhance", label: "AI enhance", icon: "sparkles-outline" },
                { k: "remove_bg", label: "Remove background", icon: "cut-outline" },
                { k: "blur_bg", label: "Blur background", icon: "aperture-outline" },
              ].map((a) => (
                <PressScale key={a.k} testID={`ai-${a.k}`} onPress={() => runAI(a.k)} disabled={!!aiBusy} style={styles.aiCard}>
                  {aiBusy === a.k ? <ActivityIndicator color={colors.brand} /> : <Icon name={a.icon as IconName} size={20} color={colors.brand} />}
                  <Text style={styles.aiText}>{a.label}</Text>
                </PressScale>
              ))}
            </View>
            <View style={styles.inputRow}>
              <TextInput testID="ai-bg-prompt" value={bgPrompt} onChangeText={setBgPrompt} placeholder="New background, e.g. Goa beach at sunset" placeholderTextColor={colors.muted} style={styles.input} />
              <OutlineButton label="Replace" loading={aiBusy === "replace_bg"} onPress={() => runAI("replace_bg")} testID="ai-replace_bg" />
            </View>
            {reasons.map((r, i) => <Text key={i} style={styles.reason}>• {r}</Text>)}
          </ScrollView>
        ) : null}

        {tool === "text" ? (
          <ScrollView>
            <View style={styles.inputRow}>
              <TextInput testID="text-input" value={newText} onChangeText={setNewText} placeholder="Type text (Hindi works too)" placeholderTextColor={colors.muted} style={styles.input} />
              <OutlineButton label="Add" testID="text-add" onPress={() => { if (!newText.trim()) return; setParams((p) => ({ ...p, texts: [...(p.texts || []), { text: newText.trim(), x: 0.5, y: 0.85, size: 0.07, color: "#FFFFFF" }] })); setSelText(texts.length); setNewText(""); }} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {texts.map((t, i) => <Chip key={i} label={t.text.slice(0, 14)} active={selText === i} onPress={() => setSelText(i)} testID={`text-item-${i}`} />)}
            </ScrollView>
            {texts[selText] ? (
              <>
                <Row label="Size" min={0.02} max={0.2} step={0.005} value={texts[selText].size} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, texts: (p.texts || []).map((t, i) => (i === selText ? { ...t, size: v } : t)) }), false)} />
                <Row label="X" min={0} max={1} step={0.01} value={texts[selText].x} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, texts: (p.texts || []).map((t, i) => (i === selText ? { ...t, x: v } : t)) }), false)} />
                <Row label="Y" min={0} max={1} step={0.01} value={texts[selText].y} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, texts: (p.texts || []).map((t, i) => (i === selText ? { ...t, y: v } : t)) }), false)} />
                <View style={styles.swatches}>
                  {SWATCHES.map((c) => <PressScale key={c} onPress={() => setParams((p) => ({ ...p, texts: (p.texts || []).map((t, i) => (i === selText ? { ...t, color: c } : t)) }))} style={[styles.swatch, { backgroundColor: c }]} testID={`text-color-${c}`} />)}
                  <IconButton name="trash-outline" testID="text-delete" onPress={() => { setParams((p) => ({ ...p, texts: (p.texts || []).filter((_, i) => i !== selText) })); setSelText(-1); }} />
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : null}

        {tool === "stickers" ? (
          <ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {STICKERS.map((g) => (
                <PressScale key={g} testID={`sticker-${g}`} style={styles.stk} onPress={() => { setParams((p) => ({ ...p, stickers: [...(p.stickers || []), { glyph: g, x: 0.5, y: 0.5, size: 0.15, color: "#FFFFFF" }] })); setSelStk(stickers.length); }}>
                  <Text style={{ fontSize: 22, color: colors.onSurface }}>{g}</Text>
                </PressScale>
              ))}
            </ScrollView>
            {stickers[selStk] ? (
              <>
                <Row label="Size" min={0.04} max={0.5} step={0.01} value={stickers[selStk].size} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, stickers: (p.stickers || []).map((t, i) => (i === selStk ? { ...t, size: v } : t)) }), false)} />
                <Row label="X" min={0} max={1} step={0.01} value={stickers[selStk].x} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, stickers: (p.stickers || []).map((t, i) => (i === selStk ? { ...t, x: v } : t)) }), false)} />
                <Row label="Y" min={0} max={1} step={0.01} value={stickers[selStk].y} onStart={startDrag} onDone={endDrag} onChange={(v) => setParams((p) => ({ ...p, stickers: (p.stickers || []).map((t, i) => (i === selStk ? { ...t, y: v } : t)) }), false)} />
                <View style={styles.swatches}>
                  {SWATCHES.map((c) => <PressScale key={c} onPress={() => setParams((p) => ({ ...p, stickers: (p.stickers || []).map((t, i) => (i === selStk ? { ...t, color: c } : t)) }))} style={[styles.swatch, { backgroundColor: c }]} />)}
                  <IconButton name="trash-outline" testID="sticker-delete" onPress={() => { setParams((p) => ({ ...p, stickers: (p.stickers || []).filter((_, i) => i !== selStk) })); setSelStk(-1); }} />
                </View>
              </>
            ) : <Text style={styles.hint}>Tap a sticker to add it, then size and place it.</Text>}
          </ScrollView>
        ) : null}

        {tool === "frames" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {FRAMES.map((f) => <Chip key={f} label={f === "none" ? "No frame" : f[0].toUpperCase() + f.slice(1)} active={(params.frame?.style || "none") === f} onPress={() => setParams((p) => ({ ...p, frame: { style: f } }))} testID={`frame-${f}`} />)}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[styles.tools, { paddingBottom: insets.bottom + spacing.sm }]}>
        {TOOLS.map((t) => (
          <PressScale key={t.key} testID={`editor-tool-${t.key}`} onPress={() => setTool(t.key)} style={styles.tool}>
            <Icon name={t.icon} size={22} color={tool === t.key ? colors.brand : colors.muted} />
            <Text style={[styles.toolText, tool === t.key && { color: colors.onSurface }]}>{t.label}</Text>
          </PressScale>
        ))}
      </ScrollView>

      <Sheet visible={presetName !== null} onClose={() => setPresetName(null)} title="Save preset" testID="preset-save-sheet">
        <TextInput testID="preset-name-input" value={presetName || ""} onChangeText={setPresetName} style={[styles.input, { marginBottom: spacing.lg, flex: 0, height: 50 }]} placeholderTextColor={colors.muted} />
        <GradientButton label="Save preset" onPress={savePreset} testID="preset-save" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  saved: { color: colors.muted, fontSize: 11 },
  next: { height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginLeft: spacing.xs },
  nextText: { color: colors.onBrandPrimary, fontWeight: "700" },
  previewWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  preview: { width: "100%", height: "100%" },
  busy: { position: "absolute", top: spacing.md, flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: colors.glass, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  busyText: { color: colors.onSurface, fontSize: 12 },
  err: { position: "absolute", bottom: 60, color: colors.error, paddingHorizontal: spacing.lg, textAlign: "center" },
  compare: { position: "absolute", right: spacing.md, bottom: spacing.md, flexDirection: "row", gap: 6, alignItems: "center", height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.glass },
  compareText: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  strip: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: "hidden", borderWidth: 2, borderColor: colors.transparent, backgroundColor: colors.surfaceSecondary },
  editedDot: { position: "absolute", right: 3, top: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandSecondary },
  panel: { height: 230, backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.sm, paddingHorizontal: spacing.md },
  chips: { gap: spacing.sm, alignItems: "center", paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowLabel: { color: colors.onSurfaceSecondary, width: 82, fontSize: 12 },
  rowVal: { color: colors.onSurface, width: 40, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },
  link: { paddingVertical: spacing.sm, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  linkText: { color: colors.brandSecondary, fontWeight: "600" },
  toggle: { flexDirection: "row", gap: spacing.sm, alignItems: "center", minHeight: 44 },
  group: { color: colors.muted, fontSize: 11, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase" },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  notice: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm },
  noticeText: { color: colors.onSurfaceTertiary, fontSize: 11, flex: 1, lineHeight: 16 },
  aiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  aiCard: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  aiText: { color: colors.onSurface, fontWeight: "600", fontSize: 13, flexShrink: 1 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  input: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: spacing.md },
  reason: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  swatches: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.xs },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.borderStrong },
  stk: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  hint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  tools: { gap: spacing.xs, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, backgroundColor: colors.surfaceSecondary },
  tool: { width: 64, alignItems: "center", gap: 2, paddingVertical: 4 },
  toolText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
});
