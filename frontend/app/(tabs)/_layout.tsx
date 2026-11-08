import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { colors } from "@/src/theme";

const TABS = [
  { name: "index", label: "Home", icon: "home", sf: "house.fill" },
  { name: "camera", label: "Camera", icon: "camera", sf: "camera.fill" },
  { name: "poses", label: "Pose AI", icon: "body", sf: "figure.stand" },
  { name: "abya", label: "ABYA", icon: "sparkles", sf: "sparkles" },
  { name: "projects", label: "Projects", icon: "albums", sf: "square.stack.fill" },
] as const;

export default function TabsLayout() {
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brand}>
        {TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name}>
            <NativeTabs.Trigger.Icon sf={t.sf as any} />
            <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.divider, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ focused, size }) => (
              <Ionicons name={(focused ? t.icon : `${t.icon}-outline`) as any} size={size - 2} color={focused ? colors.brand : colors.muted} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
