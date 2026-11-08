import Slider from "@react-native-community/slider";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Accelerometer } from "expo-sensors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { analyzeFrame, uploadPhoto, type Analysis } from "@/src/api";
import { SkeletonView } from "@/src/components/Skeleton";
import { EmptyState, GradientButton, Icon, IconButton, OutlineButton, PressScale, Title, toast } from "@/src/components/ui";
import { poseById } from "@/src/data/poses";
import { usesNativeTabs } from "@/src/navigation";
import { bodyTips, framingTips, fromLandmarks, lightingTips, matchPose, poseFigures, type MatchResult, type Person, type Tip } from "@/src/pose/match";
import { createProject, pickImages, projectRoute } from "@/src/projects";
import { saveLocalToGallery } from "@/src/share";
import { colors, radius, spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const RATIOS = { "3:4": 4 / 3, "1:1": 1, "9:16": 16 / 9 } as const;
type Ratio = keyof typeof RATIOS;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Exponential smoothing between consecutive frames so the skeleton glides instead of jumping.
function smooth(prev: Analysis | null, next: Analysis): Analysis {
  if (!prev || prev.persons.length !== next.persons.length || prev.width !== next.width) return next;
  return {
    ...next,
    persons: next.persons.map((p, i) => ({
      landmarks: p.landmarks.map((l, j) => {
        const o = prev.persons[i].landmarks[j];
        return [o[0] * 0.35 + l[0] * 0.65, o[1] * 0.35 + l[1] * 0.65, l[2]] as [number, number, number];
      }),
    })),
  };
}

async function shrink(uri: string, width: number) {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });
  return out.uri;
}

async function cropTo(uri: string, w: number, h: number, ratio: Ratio) {
  const target = 1 / RATIOS[ratio]; // width / height
  let cw = w, ch = h;
  if (w / h > target) cw = Math.round(h * target);
  else ch = Math.round(w / target);
  const ctx = ImageManipulator.manipulate(uri);
  ctx.crop({ originX: Math.round((w - cw) / 2), originY: Math.round((h - ch) / 2), width: cw, height: ch });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
  return out.uri;
}

function mapToPreview(a: Analysis, pw: number, ph: number, mirror: boolean): Person[] {
  const scale = Math.max(pw / a.width, ph / a.height);
  const dw = a.width * scale, dh = a.height * scale;
  const ox = (pw - dw) / 2, oy = (ph - dh) / 2;
  return a.persons.map((p) => {
    const out: Person = {};
    p.landmarks.forEach((l, i) => {
      let x = (ox + l[0] * dw) / pw;
      if (mirror) x = 1 - x;
      out[i] = [x, (oy + l[1] * dh) / ph, l[2]];
    });
    return out;
  });
}

const STATUS_COLOR: Record<string, string> = { match: colors.success, close: colors.warning, off: colors.error, hidden: colors.ghost };

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ pose?: string }>();
  const { width, height } = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const busy = useRef(false);
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<"off" | "on" | "auto">("off");
  const [capturing, setCapturing] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [timer, setTimer] = useState(0);
  const [count, setCount] = useState(0);
  const [grid, setGrid] = useState(true);
  const [ratio, setRatio] = useState<Ratio>("3:4");
  const [guide, setGuide] = useState(true);
  const [af, setAf] = useState<"on" | "off">("on");
  const [focusPt, setFocusPt] = useState<{ x: number; y: number } | null>(null);
  const [poseId, setPoseId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [liveErr, setLiveErr] = useState(false);
  const [roll, setRoll] = useState(0);
  const [result, setResult] = useState<{ uri: string; analysis: Analysis | null; loading: boolean } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    storage.getItem<string | null>("pm.selectedPose", null).then((id) => setPoseId(params.pose || id));
    return () => { setFocused(false); setReady(false); };
  }, [params.pose]));

  useEffect(() => {
    if (!focused) return;
    let sub: any;
    Accelerometer.isAvailableAsync().then((ok) => {
      if (!ok) return;
      try {
        Accelerometer.setUpdateInterval(200);
        sub = Accelerometer.addListener(({ x, y }) => {
          let r = (Math.atan2(x, -y) * 180) / Math.PI;
          if (r > 90) r -= 180;
          if (r < -90) r += 180;
          setRoll(r);
        });
      } catch {
        // expo-sensors web shim can report available but lack addListener
      }
    }).catch(() => {});
    return () => sub?.remove();
  }, [focused]);

  // Live guidance loop: grabs a small frame, runs MediaPipe pose + exposure stats on the server.
  useEffect(() => {
    if (!focused || !ready || !guide) return;
    let alive = true;
    (async () => {
      while (alive) {
        if (!busy.current && cam.current) {
          try {
            const shot = await cam.current.takePictureAsync({ quality: 0.3, skipProcessing: true, shutterSound: false });
            if (!alive || !shot) break;
            const small = await shrink(shot.uri, 288);
            const a = await analyzeFrame(small);
            if (alive) { setAnalysis((prev) => smooth(prev, a)); setLiveErr(false); }
          } catch {
            if (alive) setLiveErr(true);
            await sleep(2000);
          }
        }
        await sleep(150);
      }
    })();
    return () => { alive = false; };
  }, [focused, ready, guide]);

  const pose = poseById(poseId);
  const refs = useMemo(() => (pose ? poseFigures(pose) : []), [pose]);
  const topH = insets.top + 60;
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const controlsH = 170 + bottomChrome;
  const maxH = height - topH - controlsH + 60;
  let ph = Math.min(width * RATIOS[ratio], maxH);
  const pw = Math.min(width, ph / RATIOS[ratio]);
  ph = pw * RATIOS[ratio];

  const live = analysis && guide ? mapToPreview(analysis, pw, ph, facing === "front") : [];
  const rawLive = analysis ? analysis.persons.map((p) => fromLandmarks(p.landmarks)) : [];
  const match: MatchResult | null = pose && rawLive.length ? matchPose(refs, rawLive) : null;
  const boneColors = match ? Object.fromEntries(match.segments.map((s) => [s.key, STATUS_COLOR[s.status]])) : undefined;
  const tips: Tip[] = analysis && guide
    ? [...lightingTips(analysis.lighting), ...(rawLive[0] ? [...framingTips(rawLive[0]), ...bodyTips(rawLive[0])] : [{ level: "warn" as const, text: "No person detected yet" }])]
      .sort((a, b) => (a.level === "good" ? 1 : 0) - (b.level === "good" ? 1 : 0)).slice(0, 3)
    : [];
  if (Math.abs(roll) > 3 && guide) tips.unshift({ level: "warn", text: `Camera tilted ${Math.round(Math.abs(roll))}° — level the horizon` });

  if (!perm) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!perm.granted) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EmptyState icon="camera-outline" title="Camera access needed" text="PoseMate uses the camera to take photos and give live pose, lighting and framing guidance. Frames are analysed and immediately discarded." testID="camera-permission">
          {perm.canAskAgain ? (
            <GradientButton label="Allow camera" icon="camera" onPress={requestPerm} testID="camera-allow" />
          ) : (
            <GradientButton label="Open Settings" icon="settings-outline" onPress={() => Linking.openSettings()} testID="camera-open-settings" />
          )}
          <OutlineButton label="Edit a photo from gallery instead" icon="images-outline" onPress={() => fromGallery()} testID="camera-gallery-fallback" />
        </EmptyState>
      </View>
    );
  }

  async function fromGallery() {
    const a = await pickImages(false);
    if (!a.length) return;
    try {
      setSaving("edit");
      const p = await uploadPhoto(a[0].uri, a[0].mimeType);
      const proj = await createProject("photo", [p.id]);
      router.push(projectRoute(proj));
    } catch (e: any) { toast.show(e.message, "error"); } finally { setSaving(null); }
  }

  const capture = async () => {
    if (!cam.current || busy.current) return;
    busy.current = true;
    try {
      for (let i = timer; i > 0; i--) { setCount(i); await sleep(1000); }
      setCount(0);
      setCapturing(true);
      await sleep(flash === "off" ? 0 : 250);
      const photo = await cam.current.takePictureAsync({ quality: 1, shutterSound: true });
      setCapturing(false);
      if (!photo) throw new Error("Capture failed");
      const uri = await cropTo(photo.uri, photo.width, photo.height, ratio);
      setResult({ uri, analysis: null, loading: true });
      try {
        const a = await analyzeFrame(await shrink(uri, 640));
        setResult({ uri, analysis: a, loading: false });
      } catch {
        setResult({ uri, analysis: null, loading: false });
      }
    } catch (e: any) {
      toast.show(e.message || "Could not take photo", "error");
    } finally {
      setCapturing(false);
      busy.current = false;
    }
  };

  const saveResult = async () => {
    if (!result) return;
    setSaving("save");
    try {
      if (Platform.OS === "web") { toast.show("Saving to gallery works on your phone", "info"); return; }
      await saveLocalToGallery(result.uri);
      toast.show("Saved to gallery", "success");
    } catch (e: any) { toast.show(e.message, "error"); if (e.settings) Linking.openSettings(); } finally { setSaving(null); }
  };

  const editResult = async () => {
    if (!result) return;
    setSaving("edit");
    try {
      const p = await uploadPhoto(result.uri, "image/jpeg");
      const proj = await createProject("photo", [p.id]);
      setResult(null);
      router.push(projectRoute(proj));
    } catch (e: any) { toast.show(e.message, "error"); } finally { setSaving(null); }
  };

  const onTapFocus = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    setFocusPt({ x: locationX, y: locationY });
    setAf("off");
    setTimeout(() => setAf("on"), 60);
    setTimeout(() => setFocusPt(null), 900);
  };

  const resMatch = result?.analysis && pose ? matchPose(refs, result.analysis.persons.map((p) => fromLandmarks(p.landmarks))) : null;
  const resPerson = result?.analysis?.persons[0] ? fromLandmarks(result.analysis.persons[0].landmarks) : null;

  return (
    <View style={styles.root} testID="camera-screen">
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton testID="camera-flash" name={flash === "off" ? "flash-off" : "flash"} label={flash === "auto" ? "A" : undefined} onPress={() => setFlash(flash === "off" ? "on" : flash === "on" ? "auto" : "off")} />
        <IconButton testID="camera-timer" name="timer-outline" label={timer ? `${timer}s` : undefined} active={!!timer} onPress={() => setTimer(timer === 0 ? 3 : timer === 3 ? 10 : 0)} />
        <IconButton testID="camera-grid" name="grid-outline" active={grid} onPress={() => setGrid(!grid)} />
        <IconButton testID="camera-ratio" name="crop-outline" label={ratio} onPress={() => setRatio(ratio === "3:4" ? "1:1" : ratio === "1:1" ? "9:16" : "3:4")} />
        <IconButton testID="camera-ai-guide" name="sparkles" label="AI" active={guide} onPress={() => { setGuide(!guide); setAnalysis(null); }} />
      </View>

      <View style={{ width: pw, height: ph, alignSelf: "center", overflow: "hidden", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary }}>
        {focused ? (
          <CameraView
            ref={cam}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={capturing ? flash : "off"}
            zoom={zoom}
            autofocus={af}
            mode="picture"
            animateShutter={false}
            onCameraReady={() => setReady(true)}
            onMountError={() => toast.show("Camera failed to start", "error")}
          />
        ) : null}
        <Pressable style={StyleSheet.absoluteFill} onPress={onTapFocus} testID="camera-preview">
          {grid ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {[1, 2].map((i) => <View key={`v${i}`} style={[styles.gridV, { left: (pw / 3) * i }]} />)}
              {[1, 2].map((i) => <View key={`h${i}`} style={[styles.gridH, { top: (ph / 3) * i }]} />)}
            </View>
          ) : null}
          <View pointerEvents="none" style={[styles.level, { top: ph / 2, left: pw / 2 - 60, transform: [{ rotate: `${-roll}deg` }], backgroundColor: Math.abs(roll) < 1.5 ? colors.success : colors.ghost }]} />
          {pose ? <View style={StyleSheet.absoluteFill} pointerEvents="none"><SkeletonView persons={refs} width={pw} height={ph} color={colors.ghost} strokeWidth={3} padding={0.08} /></View> : null}
          {live.length ? <View style={StyleSheet.absoluteFill} pointerEvents="none"><SkeletonView persons={live} width={pw} height={ph} mode="raw" color={colors.brandSecondary} boneColors={boneColors} strokeWidth={4} /></View> : null}
          {focusPt ? <View pointerEvents="none" style={[styles.focus, { left: focusPt.x - 32, top: focusPt.y - 32 }]} /> : null}
          {count ? <Text style={styles.count} testID="camera-countdown">{count}</Text> : null}
        </Pressable>

        <View style={styles.tips} pointerEvents="none" testID="camera-tips">
          {tips.slice(0, 3).map((t, i) => (
            <View key={i} style={styles.tip}>
              <View style={[styles.dot, { backgroundColor: t.level === "good" ? colors.success : t.level === "warn" ? colors.warning : colors.error }]} />
              <Text style={styles.tipText}>{t.text}</Text>
            </View>
          ))}
          {guide && liveErr ? <View style={styles.tip}><View style={[styles.dot, { backgroundColor: colors.error }]} /><Text style={styles.tipText}>Live guide needs internet — retrying</Text></View> : null}
        </View>
        {match ? (
          <View style={styles.score} testID="camera-match-score">
            <Text style={styles.scoreNum}>{match.score}</Text>
            <Text style={styles.scoreLbl}>MATCH</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: bottomChrome + spacing.md }]}>
        <View style={styles.zoomRow}>
          <Icon name="remove" size={16} color={colors.muted} />
          <Slider testID="camera-zoom" style={{ flex: 1 }} minimumValue={0} maximumValue={1} value={zoom} onValueChange={setZoom} minimumTrackTintColor={colors.brandPrimary} maximumTrackTintColor={colors.border} thumbTintColor={colors.onSurface} />
          <Icon name="add" size={16} color={colors.muted} />
        </View>
        <PressScale testID="camera-pose-chip" onPress={() => router.push("/(tabs)/poses")} style={styles.poseChip}>
          <Icon name="body-outline" size={14} color={colors.onSurface} />
          <Text style={styles.poseChipText} numberOfLines={1}>{pose ? pose.name : "Choose a reference pose"}</Text>
          {pose ? (
            <PressScale testID="camera-pose-clear" onPress={() => { setPoseId(null); storage.removeItem("pm.selectedPose"); }}>
              <Icon name="close-circle" size={16} color={colors.muted} />
            </PressScale>
          ) : null}
        </PressScale>
        <View style={styles.shutterRow}>
          <IconButton testID="camera-gallery" name="images-outline" size={22} onPress={fromGallery} style={styles.side} />
          <PressScale testID="camera-shutter" onPress={capture} style={styles.shutterOuter} disabled={!ready}>
            <View style={styles.shutterInner}>{capturing || saving === "edit" ? <ActivityIndicator color={colors.surface} /> : null}</View>
          </PressScale>
          <IconButton testID="camera-flip" name="camera-reverse-outline" size={22} onPress={() => { setFacing(facing === "back" ? "front" : "back"); setAnalysis(null); }} style={styles.side} />
        </View>
      </View>

      <Modal visible={!!result} animationType="slide" onRequestClose={() => setResult(null)}>
        <View style={[styles.root, { paddingTop: insets.top }]} testID="capture-result">
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}>
            <View style={styles.resHead}>
              <Title size={22}>AI Pose Feedback</Title>
              <IconButton name="close" onPress={() => setResult(null)} testID="capture-result-close" />
            </View>
            {result ? <Image source={{ uri: result.uri }} style={{ width: "100%", aspectRatio: 1 / RATIOS[ratio], borderRadius: radius.md }} contentFit="cover" /> : null}
            {result?.loading ? <View style={styles.resRow}><ActivityIndicator color={colors.brand} /><Text style={styles.resText}>Analysing pose, light and framing…</Text></View> : null}
            {result && !result.loading && !result.analysis ? <Text style={[styles.resText, { marginTop: spacing.lg }]}>Couldn&apos;t analyse this photo (needs internet). You can still save or edit it.</Text> : null}
            {resMatch ? (
              <View style={styles.card} testID="capture-match">
                <View style={styles.resRow}>
                  <Text style={styles.bigScore}>{resMatch.score}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Similarity to “{pose?.name}”</Text>
                    <Text style={styles.resText}>Average angle agreement of {resMatch.segments.filter((s) => s.diff !== null).length} visible body segments{resMatch.mirrored ? " (matched as a mirror image)" : ""}. 100 = every segment within 10°.</Text>
                  </View>
                </View>
                {resMatch.coverage < 0.6 ? <Text style={[styles.resText, { color: colors.warning }]}>Only part of the body was visible, so the score is less reliable.</Text> : null}
                <View style={styles.segs}>
                  {resMatch.segments.map((s) => (
                    <View key={s.key} style={[styles.seg, { borderColor: STATUS_COLOR[s.status] }]}>
                      <Text style={styles.segText}>{s.label}{s.diff !== null ? ` · ${s.diff}°` : " · not visible"}</Text>
                    </View>
                  ))}
                </View>
                {resMatch.suggestions.map((t, i) => <Text key={i} style={styles.sugg}>• {t}</Text>)}
                {!resMatch.suggestions.length ? <Text style={styles.sugg}>• Great — your pose closely follows the reference.</Text> : null}
              </View>
            ) : null}
            {result?.analysis ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Light & composition</Text>
                {[...lightingTips(result.analysis.lighting), ...(resPerson ? [...framingTips(resPerson), ...bodyTips(resPerson)] : [{ level: "warn" as const, text: "No person detected in this photo" }])].map((t, i) => (
                  <View key={i} style={styles.resRow}>
                    <View style={[styles.dot, { backgroundColor: t.level === "good" ? colors.success : t.level === "warn" ? colors.warning : colors.error }]} />
                    <Text style={styles.resText}>{t.text}</Text>
                  </View>
                ))}
                <Text style={styles.small}>Measured: brightness {Math.round(result.analysis.lighting.mean)}/255 · clipped highlights {result.analysis.lighting.clipped_highlights}% · {result.analysis.persons.length} person(s)</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={[styles.resActions, { paddingBottom: insets.bottom + spacing.lg }]}>
            <OutlineButton label="Retake" icon="refresh" onPress={() => setResult(null)} style={{ flex: 1 }} testID="capture-retake" />
            <OutlineButton label="Save" icon="download-outline" onPress={saveResult} loading={saving === "save"} style={{ flex: 1 }} testID="capture-save" />
            <GradientButton label="Edit" icon="color-wand" onPress={editResult} loading={saving === "edit"} style={{ flex: 1 }} testID="capture-edit" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  topBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  gridV: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.ghost },
  gridH: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.ghost },
  level: { position: "absolute", width: 120, height: 2, borderRadius: 1 },
  focus: { position: "absolute", width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.warning },
  count: { position: "absolute", alignSelf: "center", top: "40%", fontSize: 96, fontWeight: "800", color: colors.onSurface },
  tips: { position: "absolute", left: spacing.sm, top: spacing.sm, right: 80, gap: 6 },
  tip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, alignSelf: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tipText: { color: colors.onSurface, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  score: { position: "absolute", right: spacing.sm, top: spacing.sm, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.glass, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandPrimary },
  scoreNum: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  scoreLbl: { color: colors.muted, fontSize: 8, letterSpacing: 1, fontWeight: "700" },
  bottom: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.lg, gap: spacing.sm },
  zoomRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 32 },
  poseChip: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 32, maxWidth: "80%" },
  poseChipText: { color: colors.onSurface, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  shutterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl },
  side: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceTertiary },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.onSurface, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.onSurface, alignItems: "center", justifyContent: "center" },
  resHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  resRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  resText: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 16 },
  bigScore: { fontSize: 44, fontWeight: "800", color: colors.brand, minWidth: 70 },
  segs: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: spacing.md },
  seg: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  segText: { color: colors.onSurfaceSecondary, fontSize: 11 },
  sugg: { color: colors.onSurface, fontSize: 14, lineHeight: 22 },
  small: { color: colors.muted, fontSize: 11, marginTop: spacing.md },
  resActions: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.scrim },
});
