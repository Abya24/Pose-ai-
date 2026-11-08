import Slider from "@react-native-community/slider";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/theme";

export function Row({ label, value, min, max, step = 1, onChange, onStart, onDone, testID }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onStart?: () => void; onDone?: () => void; testID?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Slider testID={testID} style={{ flex: 1, height: 40 }} minimumValue={min} maximumValue={max} step={step} value={value}
        onSlidingStart={onStart} onValueChange={onChange} onSlidingComplete={onDone}
        minimumTrackTintColor={colors.brandPrimary} maximumTrackTintColor={colors.border} thumbTintColor={colors.onSurface} />
      <Text style={styles.rowVal}>{step < 1 ? value.toFixed(2) : Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowLabel: { color: colors.onSurfaceSecondary, width: 82, fontSize: 12 },
  rowVal: { color: colors.onSurface, width: 40, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },
});
