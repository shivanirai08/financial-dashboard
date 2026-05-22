import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { PlayerOverlay } from "@/components/PlayerOverlay";
import { ToastHost } from "@/components/ToastHost";
import { HomeScreen } from "@/screens/HomeScreen";
import { FavsScreen } from "@/screens/FavsScreen";
import { PlaylistScreen } from "@/screens/PlaylistScreen";
import { usePlaybackBridge } from "@/lib/usePlaybackBridge";
import { colors } from "@/theme";

export type RootStackParamList = {
  Tabs: undefined;
  Playlist: { slug: string };
};

export type RootTabParamList = {
  Library: undefined;
  Favorites: undefined;
};

const Tabs = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#08111e",
          borderTopColor: "rgba(255,255,255,0.08)"
        },
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: "#718096",
        tabBarIcon: ({ color, size }) => {
          const name = route.name === "Library" ? "library-outline" : "heart-outline";
          return <Ionicons name={name} color={color} size={size} />;
        }
      })}
    >
      <Tabs.Screen name="Library" component={HomeScreen} />
      <Tabs.Screen name="Favorites" component={FavsScreen} />
    </Tabs.Navigator>
  );
}

function AppShell() {
  usePlaybackBridge();

  return (
    <>
      <NavigationContainer
        theme={{
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: colors.bg,
            card: colors.panel,
            primary: colors.cyan,
            text: colors.text,
            border: "rgba(255,255,255,0.08)"
          }
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg }
          }}
        >
          <Stack.Screen name="Tabs" component={TabsNavigator} />
          <Stack.Screen name="Playlist" component={PlaylistScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <PlayerOverlay />
      <ToastHost />
      <StatusBar style="light" />
    </>
  );
}

export default function App() {
  useEffect(() => {
    // No-op root effect keeps the shell explicit for future app boot hooks.
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
