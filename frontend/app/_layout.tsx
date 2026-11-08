import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { getDeviceId } from "@/src/api";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastHost } from "@/src/components/ui";
import { queryClient } from "@/src/query-client";
import { SubscriptionProvider, initializeRevenueCat } from "@/src/revenuecat";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);

try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk: require("../assets/fonts/SpaceGrotesk.ttf") });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getDeviceId().finally(() => setReady(true));
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <StatusBar style="light" />
            {ready && fontsLoaded ? (
              <SubscriptionProvider>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "slide_from_right" }}>
                  <Stack.Screen name="premium" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                </Stack>
              </SubscriptionProvider>
            ) : (
              <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} /></View>
            )}
            <ToastHost />
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
