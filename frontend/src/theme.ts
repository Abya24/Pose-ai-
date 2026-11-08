// Design tokens for PoseMate AI. Dark-only "Glass / Luxe" palette from /app/design_guidelines.json.
import { useMemo } from "react";
import { Appearance, StyleSheet } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#050505",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#141417",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#1F1F24",
  onSurfaceTertiary: "#B0B0B0",
  surfaceInverse: "#FAFAFA",
  onSurfaceInverse: "#050505",
  muted: "#8A8A99",

  brand: "#7E57C2",
  onBrand: "#FFFFFF",
  brandPrimary: "#651FFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#2979FF",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#311B92",
  onBrandTertiary: "#E8EAF6",

  success: "#00E676",
  onSuccess: "#050505",
  warning: "#FFC400",
  onWarning: "#050505",
  error: "#FF1744",
  onError: "#FFFFFF",
  info: "#00B0FF",
  onInfo: "#050505",

  border: "#2A2A35",
  borderStrong: "#4A4A60",
  divider: "#1A1A22",

  // overlays used on top of photos / camera feed
  scrim: "rgba(5,5,5,0.85)",
  glass: "rgba(20,20,23,0.78)",
  glassLight: "rgba(255,255,255,0.12)",
  ghost: "rgba(255,255,255,0.55)",
  transparent: "transparent",
};

export type ThemeColors = typeof dark;

export const colors = dark;
export const gradient = [dark.brandPrimary, dark.brandSecondary] as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fonts = { display: "SpaceGrotesk" };

export const defaultScheme = "dark" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "dark", colors: dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    return useMemo(() => StyleSheet.create(factory(dark)), []);
  };
}
