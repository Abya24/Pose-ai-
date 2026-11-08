import { Ionicons, type IoniconsIconName } from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Modal, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, gradient, radius, spacing } from "@/src/theme";

export const Icon = Ionicons;
export type IconName = IoniconsIconName;

export function tap() {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

export function PressScale({ children, onPress, style, testID, disabled, onLongPress }: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; testID?: string; disabled?: boolean; onLongPress?: () => void;
}) {
  return (
    <Pressable testID={testID} disabled={disabled} onLongPress={onLongPress} onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => [style, { opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

export function GradientButton({ label, icon, onPress, loading, disabled, testID, style }: {
  label: string; icon?: IconName; onPress?: () => void; loading?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressScale testID={testID} onPress={onPress} disabled={disabled || loading} style={style}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.gbtn}>
        {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
          <>
            {icon ? <Icon name={icon} size={18} color={colors.onBrandPrimary} /> : null}
            <Text style={s.gbtnText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </PressScale>
  );
}

export function OutlineButton({ label, icon, onPress, testID, style, danger, loading }: {
  label: string; icon?: IconName; onPress?: () => void; testID?: string; style?: StyleProp<ViewStyle>; danger?: boolean; loading?: boolean;
}) {
  const c = danger ? colors.error : colors.onSurface;
  return (
    <PressScale testID={testID} onPress={onPress} disabled={loading} style={[s.obtn, danger && { borderColor: colors.error }, style]}>
      {loading ? <ActivityIndicator color={c} /> : icon ? <Icon name={icon} size={18} color={c} /> : null}
      <Text style={[s.obtnText, { color: c }]}>{label}</Text>
    </PressScale>
  );
}

export function IconButton({ name, onPress, testID, active, size = 20, style, label }: {
  name: IconName; onPress?: () => void; testID?: string; active?: boolean; size?: number; style?: StyleProp<ViewStyle>; label?: string;
}) {
  return (
    <PressScale testID={testID} onPress={onPress} style={[s.ibtn, active && { backgroundColor: colors.brandPrimary }, style]}>
      <Icon name={name} size={size} color={colors.onSurface} />
      {label ? <Text style={s.ibtnLabel}>{label}</Text> : null}
    </PressScale>
  );
}

export function Chip({ label, active, onPress, testID, icon }: { label: string; active?: boolean; onPress?: () => void; testID?: string; icon?: IconName }) {
  return (
    <PressScale testID={testID} onPress={onPress} style={[s.chip, active && s.chipActive]}>
      {icon ? <Icon name={icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary} /> : null}
      <Text style={[s.chipText, active && { color: colors.onBrandPrimary }]} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
}

export function Title({ children, size = 24, style }: { children: React.ReactNode; size?: number; style?: any }) {
  return <Text style={[{ fontFamily: fonts.display, fontSize: size, color: colors.onSurface, fontWeight: "700", letterSpacing: -0.5 }, style]}>{children}</Text>;
}

export function Sheet({ visible, onClose, children, title, testID }: { visible: boolean; onClose: () => void; children: React.ReactNode; title?: string; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose} testID={testID ? `${testID}-backdrop` : undefined} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID={testID}>
        <View style={s.handle} />
        {title ? <Title size={20} style={{ marginBottom: spacing.md }}>{title}</Title> : null}
        {children}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- toast
type ToastMsg = { id: number; text: string; type: "info" | "success" | "error" };
let listeners: ((m: ToastMsg) => void)[] = [];
export const toast = {
  show(text: string, type: ToastMsg["type"] = "info") {
    const m = { id: Date.now(), text, type };
    listeners.forEach((l) => l(m));
  },
};

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let t: any;
    const l = (m: ToastMsg) => {
      setMsg(m);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
      clearTimeout(t);
      t = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null)), 3200);
    };
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); clearTimeout(t); };
  }, [anim]);
  if (!msg) return null;
  const bg = msg.type === "error" ? colors.error : msg.type === "success" ? colors.success : colors.surfaceInverse;
  const fg = msg.type === "error" ? colors.onError : msg.type === "success" ? colors.onSuccess : colors.onSurfaceInverse;
  return (
    <Animated.View pointerEvents="none" testID="toast" style={[s.toast, { top: insets.top + spacing.sm, backgroundColor: bg, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <Text style={{ color: fg, fontWeight: "600", fontSize: 14 }}>{msg.text}</Text>
    </Animated.View>
  );
}

export function EmptyState({ icon, title, text, children, testID }: { icon: IconName; title: string; text: string; children?: React.ReactNode; testID?: string }) {
  return (
    <View style={s.empty} testID={testID}>
      <View style={s.emptyIcon}><Icon name={icon} size={30} color={colors.brand} /></View>
      <Title size={20} style={{ textAlign: "center" }}>{title}</Title>
      <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 }}>{text}</Text>
      <View style={{ marginTop: spacing.xl, gap: spacing.md, alignSelf: "stretch" }}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  gbtn: { height: 52, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.xl },
  gbtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  obtn: { height: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
  obtnText: { fontSize: 15, fontWeight: "600" },
  ibtn: { minWidth: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.glass, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm },
  ibtnLabel: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  chip: { height: 36, flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxHeight: "85%", borderTopWidth: 1, borderColor: colors.border },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  empty: { alignItems: "center", padding: spacing.xl, paddingTop: spacing.xxxl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
});
