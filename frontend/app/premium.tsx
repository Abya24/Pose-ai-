import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GradientButton, Icon, IconButton, OutlineButton, PressScale, Sheet, Title, toast } from "@/src/components/ui";
import { FREE_AI_PER_DAY, isTestStore, useSubscription } from "@/src/revenuecat";
import { colors, gradient, radius, spacing } from "@/src/theme";

const PERKS = [
  { icon: "sparkles", text: "Unlimited AI enhance & background remove, blur, replace" },
  { icon: "heart", text: "Exclusive Bridal, Haldi, Sangeet & Festival pose packs" },
  { icon: "people", text: "Couple & family wedding poses with step-by-step guidance" },
  { icon: "infinite", text: `Free plan keeps ${FREE_AI_PER_DAY} AI edits a day and all 25 core poses` },
] as const;

export default function Premium() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { offerings, isSubscribed, isLoading, identityReady, identityError, purchase, restore, isPurchasing, isRestoring } = useSubscription();
  const pkgs = offerings?.current?.availablePackages ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PurchasesPackage | null>(null);
  const chosen = pkgs.find((p) => p.identifier === selected) ?? pkgs.find((p) => p.packageType === "ANNUAL") ?? pkgs[0];

  const buy = async (pkg: PurchasesPackage) => {
    try {
      await purchase(pkg);
      toast.show("Welcome to PoseMate Premium", "success");
      router.back();
    } catch (e: any) {
      if (e?.userCancelled) return;
      toast.show(e?.message === "identity_not_ready" ? "Account not ready yet — try again in a moment" : e?.message || "Purchase failed", "error");
    }
  };

  return (
    <View style={styles.root} testID="premium-screen">
      <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={styles.glow} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={{ alignItems: "flex-end" }}><IconButton name="close" onPress={() => router.back()} testID="premium-close" /></View>
        <LinearGradient colors={gradient} style={styles.badge}><Icon name="diamond" size={30} color={colors.onBrandPrimary} /></LinearGradient>
        <Title size={30} style={{ textAlign: "center", marginTop: spacing.lg }}>PoseMate Premium</Title>
        {reason ? <Text style={styles.reason} testID="premium-reason">{reason}</Text> : null}
        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          {PERKS.map((p) => (
            <View key={p.text} style={styles.perk}><Icon name={p.icon} size={20} color={colors.brand} /><Text style={styles.perkText}>{p.text}</Text></View>
          ))}
        </View>

        {isSubscribed ? (
          <View style={styles.active} testID="premium-active">
            <Icon name="checkmark-circle" size={22} color={colors.success} />
            <Text style={{ color: colors.onSurface, fontWeight: "700", flex: 1 }}>Premium is active on this device{isTestStore ? " (test purchase, simulated)" : ""}</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : pkgs.length === 0 ? (
          <Text style={styles.unavailable} testID="premium-unavailable">Subscription options are unavailable right now. Please try again later.</Text>
        ) : (
          <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
            {pkgs.map((p) => {
              const on = chosen?.identifier === p.identifier;
              const yearly = p.packageType === "ANNUAL";
              return (
                <PressScale key={p.identifier} testID={`premium-pkg-${yearly ? "annual" : "monthly"}`} onPress={() => setSelected(p.identifier)} style={[styles.pkg, on && styles.pkgOn]}>
                  <Icon name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? colors.brand : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pkgTitle}>{yearly ? "Yearly" : "Monthly"}</Text>
                    <Text style={styles.pkgSub}>{p.product.priceString} / {yearly ? "year" : "month"}</Text>
                  </View>
                  {yearly ? <View style={styles.save}><Text style={styles.saveText}>BEST VALUE</Text></View> : null}
                </PressScale>
              );
            })}
            {identityError ? <Text style={styles.err}>Purchases unavailable: {identityError}</Text> : null}
            <GradientButton label={chosen ? `Continue · ${chosen.product.priceString}` : "Continue"} loading={isPurchasing} disabled={!chosen || !identityReady}
              testID="premium-buy" onPress={() => chosen && (isTestStore ? setConfirm(chosen) : buy(chosen))} style={{ marginTop: spacing.sm }} />
            {isTestStore ? <Text style={styles.note}>Preview mode: purchases are simulated with the RevenueCat Test Store — no money moves.</Text> : <Text style={styles.note}>Auto-renews until cancelled in Google Play / App Store.</Text>}
          </View>
        )}
        <OutlineButton label="Restore purchases" icon="refresh" loading={isRestoring} testID="premium-restore" style={{ marginTop: spacing.lg }}
          onPress={async () => { try { const info = await restore(); toast.show(info.entitlements.active.pro ? "Premium restored" : "No previous purchase found", "info"); } catch (e: any) { toast.show(e?.message || "Restore failed", "error"); } }} />
      </ScrollView>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title="Confirm test purchase" testID="premium-confirm-sheet">
        <Text style={{ color: colors.onSurfaceSecondary, marginBottom: spacing.lg }}>This is a simulated purchase of {confirm?.product.priceString} in the test store. No real payment is taken.</Text>
        <GradientButton label="Confirm (simulated)" testID="premium-confirm" onPress={() => { const p = confirm; setConfirm(null); if (p) buy(p); }} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  glow: { position: "absolute", left: 0, right: 0, top: 0, height: 360 },
  badge: { width: 72, height: 72, borderRadius: 36, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  reason: { color: colors.warning, textAlign: "center", marginTop: spacing.sm },
  perk: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  perkText: { color: colors.onSurfaceSecondary, flex: 1, fontSize: 15, lineHeight: 21 },
  active: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  unavailable: { color: colors.muted, textAlign: "center", marginTop: spacing.xl },
  pkg: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  pkgOn: { borderColor: colors.brandPrimary, borderWidth: 2 },
  pkgTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 16 },
  pkgSub: { color: colors.muted, marginTop: 2 },
  save: { backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  saveText: { color: colors.onSuccess, fontSize: 10, fontWeight: "800" },
  err: { color: colors.error, fontSize: 12 },
  note: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
