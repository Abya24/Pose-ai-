import { AudioModule, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type AudioPlayer } from "expo-audio";
import { fetch as expoFetch } from "expo/fetch";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BASE, api, getDeviceId, photoUri, uploadPhoto } from "@/src/api";
import { Chip, GradientButton, Icon, IconButton, PressScale, Sheet, Title, toast } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { pickImages } from "@/src/projects";
import { copyText } from "@/src/share";
import { colors, radius, spacing } from "@/src/theme";
import { uploadForm } from "@/src/utils/upload";
import { storage } from "@/src/utils/storage";

import { LANGS } from "@/src/langs";
const SUGGESTIONS = [
  "Best poses for a couple photo at sunset",
  "How do I shoot portraits in low light?",
  "Camera angle to look taller in photos",
  "Write an Instagram caption + hashtags for a wedding photo",
];

type Msg = { id: string; role: "user" | "assistant"; text: string; photo_id?: string | null; error?: boolean };
type Session = { id: string; title: string; updated_at: string; language: string };

async function streamChat(body: any, onEvent: (e: any) => void) {
  const d = await getDeviceId();
  const init = { method: "POST", headers: { "Content-Type": "application/json", "X-Device-Id": d, Accept: "text/event-stream" }, body: JSON.stringify(body) };
  const res: any = Platform.OS === "web" ? await fetch(`${BASE}/api/abya/chat`, init) : await expoFetch(`${BASE}/api/abya/chat`, init);
  if (!res.ok) throw new Error(`ABYA is unavailable (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)));
    }
  }
}

export default function Abya() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const [lang, setLang] = useState("English");
  const [voiceOn, setVoiceOn] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [langSheet, setLangSheet] = useState(false);
  const [histSheet, setHistSheet] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [voice, setVoice] = useState<"idle" | "listening" | "transcribing">("idle");
  const [speaking, setSpeaking] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const scroll = useRef<any>(null);
  const player = useRef<AudioPlayer | null>(null);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const rec = useAudioRecorderState(recorder, 100);
  const vad = useRef({ start: 0, floor: -60, samples: [] as number[], spoke: false, silentSince: 0 });
  const watchdog = useRef<any>(null);
  const preparing = useRef(false);

  useEffect(() => {
    storage.getItem<string>("pm.lang", "English").then((v) => setLang(v || "English"));
    storage.getItem<boolean>("pm.voice", false).then((v) => setVoiceOn(!!v));
  }, []);
  useEffect(() => { if (params.prompt) setInput(String(params.prompt)); }, [params.prompt]);

  useFocusEffect(useCallback(() => () => {
    clearTimeout(watchdog.current);
    try { if (recorder.isRecording) recorder.stop().catch(() => {}); } catch {}
    try { player.current?.pause(); } catch {}
  }, [recorder]));

  const stopPlayback = () => {
    try { player.current?.pause(); player.current?.remove(); } catch {}
    player.current = null;
    setSpeaking(false);
  };

  const speak = async (text: string) => {
    try {
      setSpeaking(true);
      const { url } = await api<{ url: string }>("/abya/tts", { body: { text } });
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      stopPlayback();
      setSpeaking(true);
      const p = createAudioPlayer({ uri: `${BASE}${url}` });
      player.current = p;
      p.addListener("playbackStatusUpdate", (s: any) => { if (s.didJustFinish) stopPlayback(); });
      p.play();
    } catch (e: any) {
      setSpeaking(false);
      toast.show(e.message || "Voice reply failed", "error");
    }
  };

  const send = async (textIn?: string) => {
    const text = (textIn ?? input).trim();
    if (!text || sending) return;
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text, photo_id: photo };
    const aiId = `a${Date.now()}`;
    setMsgs((m) => [...m, userMsg, { id: aiId, role: "assistant", text: "" }]);
    setInput("");
    const attached = photo;
    setPhoto(null);
    setSending(true);
    let full = "";
    try {
      await streamChat({ session_id: sessionId, message: text, language: lang, photo_id: attached }, (e) => {
        if (e.session_id) setSessionId(e.session_id);
        if (e.delta) {
          full += e.delta;
          setMsgs((m) => m.map((x) => (x.id === aiId ? { ...x, text: full } : x)));
        }
        if (e.error) throw new Error(e.error);
      });
      if (!full) throw new Error("ABYA returned an empty reply. Please retry.");
      if (voiceOn) speak(full);
    } catch (err: any) {
      setMsgs((m) => m.map((x) => (x.id === aiId ? { ...x, text: err.message || "Network error", error: true } : x)));
    } finally {
      setSending(false);
    }
  };

  const retry = (aiId: string) => {
    const idx = msgs.findIndex((m) => m.id === aiId);
    const prev = msgs[idx - 1];
    setMsgs((m) => m.filter((x) => x.id !== aiId && x.id !== prev?.id));
    if (prev) { setPhoto(prev.photo_id ?? null); send(prev.text); }
  };

  // ------------------------------------------------ voice input
  const stopListening = useCallback(async (submit: boolean) => {
    clearTimeout(watchdog.current);
    let uri: string | null = null;
    try { await recorder.stop(); uri = recorder.uri; } catch {}
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (!submit || !uri) { setVoice("idle"); return; }
    setVoice("transcribing");
    try {
      const res = await uploadForm(`${BASE}/api/abya/stt`, { headers: { "X-Device-Id": await getDeviceId() }, fields: { language: lang }, files: { audio: { uri, name: "voice.m4a", mimeType: "audio/m4a" } } });
      if (!res.ok) throw new Error("Transcription failed");
      const { text } = await res.json();
      if (!text) toast.show("Didn't catch that — try again", "info");
      else await send(text);
    } catch (e: any) {
      toast.show(e.message || "Voice input failed", "error");
    } finally {
      setVoice("idle");
    }
  }, [recorder, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = async () => {
    if (preparing.current) return;
    if (voice === "listening") return stopListening(true);
    stopPlayback();
    preparing.current = true;
    try {
      let p = await AudioModule.getRecordingPermissionsAsync();
      if (!p.granted) {
        if (!p.canAskAgain) { setMicBlocked(true); return; }
        p = await AudioModule.requestRecordingPermissionsAsync();
        if (!p.granted) { if (!p.canAskAgain) setMicBlocked(true); else toast.show("Microphone is needed for voice questions", "info"); return; }
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      vad.current = { start: Date.now(), floor: -60, samples: [], spoke: false, silentSince: 0 };
      setVoice("listening");
      watchdog.current = setTimeout(() => stopListening(true), 60000);
    } catch (e: any) {
      toast.show(`Microphone error: ${e.message}`, "error");
      setVoice("idle");
    } finally {
      preparing.current = false;
    }
  };

  // Silence auto-stop with a calibrated noise floor (only when metering is reported).
  useEffect(() => {
    if (voice !== "listening" || rec.metering === undefined || rec.metering === null) return;
    const v = vad.current, m = rec.metering, t = Date.now() - v.start;
    if (t < 400) return;
    if (t < 900) { v.samples.push(m); v.floor = v.samples.reduce((a, b) => a + b, 0) / v.samples.length; return; }
    if (m > v.floor + 12) { v.spoke = true; v.silentSince = 0; }
    else if (v.spoke && m < v.floor + 6) {
      if (!v.silentSince) v.silentSince = Date.now();
      else if (Date.now() - v.silentSince > 1800) stopListening(true);
    }
  }, [rec.metering, voice, stopListening]);

  // ------------------------------------------------ history
  const openHistory = async () => {
    setHistSheet(true);
    try { setSessions(await api<Session[]>("/abya/sessions")); } catch (e: any) { toast.show(e.message, "error"); }
  };
  const loadSession = async (s: Session) => {
    try {
      const m = await api<Msg[]>(`/abya/sessions/${s.id}/messages`);
      setSessionId(s.id);
      setMsgs(m);
      setHistSheet(false);
    } catch (e: any) { toast.show(e.message, "error"); }
  };
  const deleteSession = async (s: Session) => {
    await api(`/abya/sessions/${s.id}`, { method: "DELETE" }).catch(() => {});
    setSessions((x) => x.filter((y) => y.id !== s.id));
    if (s.id === sessionId) { setSessionId(null); setMsgs([]); }
  };

  const attach = async () => {
    const a = await pickImages(false);
    if (!a.length) return;
    try {
      const p = await uploadPhoto(a[0].uri, a[0].mimeType);
      setPhoto(p.id);
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + spacing.sm }]}>
        <View style={{ flex: 1 }}>
          <Title size={22}>ABYA</Title>
          <Text style={styles.sub} numberOfLines={1}>Photo assistant</Text>
        </View>
        <PressScale testID="abya-language" onPress={() => setLangSheet(true)} style={styles.langBtn}>
          <Icon name="language" size={16} color={colors.onSurface} />
          <Text style={styles.langText}>{lang}</Text>
        </PressScale>
        <IconButton testID="abya-voice-toggle" name={voiceOn ? "volume-high" : "volume-mute"} active={voiceOn} onPress={() => { const v = !voiceOn; setVoiceOn(v); storage.setItem("pm.voice", v); if (!v) stopPlayback(); }} />
        <IconButton testID="abya-history" name="time-outline" onPress={openHistory} />
        <IconButton testID="abya-new-chat" name="create-outline" onPress={() => { setSessionId(null); setMsgs([]); stopPlayback(); }} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          {msgs.length === 0 ? (
            <View style={styles.welcome} testID="abya-welcome">
              <View style={styles.orb}><Icon name="sparkles" size={34} color={colors.onBrandPrimary} /></View>
              <Title size={22} style={{ textAlign: "center" }}>Namaste! I&apos;m ABYA</Title>
              <Text style={styles.welcomeText}>Ask about poses, angles, lighting, editing, or captions — type or tap the mic. I reply in {lang}.</Text>
              <View style={{ gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.xl }}>
                {SUGGESTIONS.map((s, i) => (
                  <PressScale key={s} testID={`abya-suggestion-${i}`} onPress={() => send(s)} style={styles.sugg}>
                    <Text style={styles.suggText}>{s}</Text>
                    <Icon name="arrow-forward" size={16} color={colors.muted} />
                  </PressScale>
                ))}
              </View>
            </View>
          ) : (
            msgs.map((m) => (
              <View key={m.id} style={[styles.bubble, m.role === "user" ? styles.user : styles.ai, m.error && { borderColor: colors.error, borderWidth: 1 }]} testID={`abya-msg-${m.role}`}>
                {m.photo_id ? <Image source={{ uri: photoUri(m.photo_id, 400) }} style={styles.msgImg} contentFit="cover" /> : null}
                {m.text ? <Text style={styles.msgText} selectable>{m.text}</Text> : <ActivityIndicator color={colors.onBrandTertiary} />}
                {m.role === "assistant" && m.text && !sending ? (
                  <View style={styles.msgActions}>
                    {m.error ? (
                      <PressScale testID="abya-retry" onPress={() => retry(m.id)} style={styles.msgAct}><Icon name="refresh" size={14} color={colors.onSurface} /><Text style={styles.msgActText}>Retry</Text></PressScale>
                    ) : (
                      <>
                        <PressScale testID="abya-copy" onPress={() => { copyText(m.text); toast.show("Copied", "success"); }} style={styles.msgAct}><Icon name="copy-outline" size={14} color={colors.onSurface} /><Text style={styles.msgActText}>Copy</Text></PressScale>
                        <PressScale testID="abya-speak" onPress={() => (speaking ? stopPlayback() : speak(m.text))} style={styles.msgAct}><Icon name={speaking ? "stop" : "volume-high-outline"} size={14} color={colors.onSurface} /><Text style={styles.msgActText}>{speaking ? "Stop" : "Listen"}</Text></PressScale>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>

        {voice !== "idle" ? (
          <View style={styles.listening} testID="abya-listening">
            {voice === "listening" ? <View style={styles.recDot} /> : <ActivityIndicator color={colors.brand} />}
            <Text style={styles.listeningText}>{voice === "listening" ? "Listening… pause or tap the mic to finish" : "Transcribing…"}</Text>
            {voice === "listening" ? <PressScale testID="abya-cancel-voice" onPress={() => stopListening(false)}><Text style={{ color: colors.muted }}>Cancel</Text></PressScale> : null}
          </View>
        ) : null}

        <View style={[styles.inputBar, { paddingBottom: bottomChrome + spacing.md }]}>
          {photo ? (
            <View style={styles.attached}>
              <Image source={{ uri: photoUri(photo, 200) }} style={{ width: 44, height: 44, borderRadius: radius.sm }} />
              <Text style={{ color: colors.muted, flex: 1, fontSize: 12 }}>Photo attached — ABYA will look at it</Text>
              <PressScale testID="abya-remove-photo" onPress={() => setPhoto(null)}><Icon name="close-circle" size={20} color={colors.muted} /></PressScale>
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <IconButton testID="abya-attach" name="image-outline" onPress={attach} />
            <TextInput testID="abya-input" value={input} onChangeText={setInput} placeholder={`Message ABYA in ${lang}…`} placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={2000} />
            {input.trim() ? (
              <PressScale testID="abya-send" onPress={() => send()} disabled={sending} style={styles.send}>
                {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Icon name="arrow-up" size={20} color={colors.onBrandPrimary} />}
              </PressScale>
            ) : (
              <PressScale testID="abya-mic" onPress={startListening} disabled={sending || voice === "transcribing"} style={[styles.send, voice === "listening" && { backgroundColor: colors.error }]}>
                <Icon name={voice === "listening" ? "stop" : "mic"} size={20} color={colors.onBrandPrimary} />
              </PressScale>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={langSheet} onClose={() => setLangSheet(false)} title="Reply language" testID="abya-lang-sheet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {LANGS.map((l) => (
            <Chip key={l} label={l} active={l === lang} testID={`abya-lang-${l.toLowerCase()}`} onPress={() => { setLang(l); storage.setItem("pm.lang", l); setLangSheet(false); }} />
          ))}
        </View>
      </Sheet>

      <Sheet visible={histSheet} onClose={() => setHistSheet(false)} title="Conversation history" testID="abya-history-sheet">
        <ScrollView style={{ maxHeight: 420 }}>
          {sessions.length === 0 ? <Text style={{ color: colors.muted }}>No conversations yet.</Text> : null}
          {sessions.map((s) => (
            <View key={s.id} style={styles.sessRow}>
              <PressScale testID={`abya-session-${s.id}`} onPress={() => loadSession(s)} style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontWeight: "600" }} numberOfLines={1}>{s.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{s.language} · {new Date(s.updated_at).toLocaleString()}</Text>
              </PressScale>
              <IconButton name="trash-outline" onPress={() => deleteSession(s)} testID={`abya-session-delete-${s.id}`} />
            </View>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet visible={micBlocked} onClose={() => setMicBlocked(false)} title="Microphone is off" testID="abya-mic-blocked">
        <Text style={{ color: colors.onSurfaceSecondary, marginBottom: spacing.lg }}>Turn on microphone access in Settings to ask ABYA by voice. You can keep typing meanwhile.</Text>
        <GradientButton label="Open Settings" icon="settings-outline" onPress={() => { setMicBlocked(false); Linking.openSettings(); }} testID="abya-open-settings" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sub: { color: colors.muted, fontSize: 12 },
  langBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  langText: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  welcome: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl },
  orb: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  welcomeText: { color: colors.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 },
  sugg: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  suggText: { color: colors.onSurface, flex: 1 },
  bubble: { maxWidth: "88%", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  user: { alignSelf: "flex-end", backgroundColor: colors.surfaceSecondary, borderBottomRightRadius: radius.sm },
  ai: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderBottomLeftRadius: radius.sm },
  msgText: { color: colors.onSurface, fontSize: 15, lineHeight: 22 },
  msgImg: { width: 180, height: 180, borderRadius: radius.md, marginBottom: spacing.sm },
  msgActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  msgAct: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, height: 30, borderRadius: radius.pill, backgroundColor: colors.glassLight },
  msgActText: { color: colors.onSurface, fontSize: 12 },
  listening: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
  listeningText: { color: colors.onSurface, flex: 1, fontSize: 13 },
  inputBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  attached: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  sessRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
