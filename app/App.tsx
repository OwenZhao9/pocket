import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { EXPLORER } from "./src/config";
import { JudgePanel } from "./src/JudgePanel";
import { short } from "./src/format";
import { Insight } from "./src/screens/Insight";
import { Journal } from "./src/screens/Journal";
import { Positions } from "./src/screens/Positions";
import { Trade } from "./src/screens/Trade";
import { Welcome } from "./src/screens/Welcome";
import { StoreProvider, useStore } from "./src/store";
import { TxLink } from "./src/ui/components";
import { tap } from "./src/ui/haptics";
import { colors, radius, space, type } from "./src/ui/theme";

type Tab = "trade" | "positions" | "insight" | "journal";
const TABS: [Tab, string][] = [
  ["trade", "交易"],
  ["positions", "持仓"],
  ["insight", "行情"],
  ["journal", "日记"],
];

function Header() {
  const { session, setSession, showToast } = useStore();
  if (!session) return null;
  const address = session.account.address;
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>Pocket</Text>
      <View style={styles.headerRight}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="复制地址"
          onPress={async () => {
            await Clipboard.setStringAsync(address);
            showToast({ text: `地址已复制 ${short(address)}` });
          }}
          onLongPress={() => Linking.openURL(`${EXPLORER}/address/${address}`)}
          style={styles.pill}
        >
          <View style={[styles.liveDot, session.kind === "demo" && { backgroundColor: colors.warn }]} />
          <Text style={styles.pillText}>
            {session.kind === "demo" ? "演示账户 · " : ""}
            {short(address)}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSession(null)} style={styles.lock}>
          <Text style={styles.lockText}>锁定</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToastView() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <View style={styles.toastLayer} pointerEvents="box-none">
      <View style={[styles.toast, toast.tone === "error" && { borderColor: colors.up }]}>
        <Text style={styles.toastText}>{toast.text}</Text>
        {toast.tx && <TxLink hash={toast.tx} />}
      </View>
    </View>
  );
}

function Main() {
  const { session } = useStore();
  const [tab, setTab] = useState<Tab>("trade");

  if (!session) return <Welcome />;

  return (
    <View style={{ flex: 1 }}>
      <Header />
      <View style={{ flex: 1 }}>
        {tab === "trade" && <Trade onDone={() => setTab("positions")} />}
        {tab === "positions" && <Positions />}
        {tab === "insight" && <Insight />}
        {tab === "journal" && <Journal />}
      </View>
      <View style={styles.tabbar}>
        {TABS.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => {
              tap();
              setTab(key);
            }}
            style={styles.tab}
          >
            <Text style={[styles.tabText, tab === key && styles.tabOn]}>{label}</Text>
            {tab === key && <View style={styles.tabMark} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/// On a wide browser window the app sits in a phone frame next to a panel for judges;
/// everywhere else it fills the screen as a normal mobile app.
function Shell() {
  const { width, height } = useWindowDimensions();
  if (Platform.OS === "web" && width >= 1100) {
    const frameHeight = Math.min(860, height - 48);
    return (
      <View style={styles.wide}>
        <View style={[styles.phone, { height: frameHeight }]}>
          <Main />
          <ToastView />
        </View>
        <View style={[styles.panel, { height: frameHeight }]}>
          <JudgePanel />
        </View>
      </View>
    );
  }
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <Main />
      <ToastView />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  wide: {
    flex: 1,
    backgroundColor: "#060608",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 64,
  },
  panel: { width: 460, flexShrink: 0 },
  phone: {
    width: 400,
    flexShrink: 0,
    borderRadius: 52,
    borderWidth: 10,
    borderColor: "#24242C",
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  brand: { ...type.title, color: colors.text, fontSize: 20 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    height: 34,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.down, marginRight: space.s },
  pillText: { ...type.small, ...type.num, color: colors.text },
  lock: { marginLeft: space.s, paddingHorizontal: space.m, height: 34, justifyContent: "center" },
  lockText: { ...type.small, color: colors.sub },
  tabbar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: space.m },
  tabText: { ...type.body, color: colors.faint, fontSize: 15 },
  tabOn: { color: colors.text, fontWeight: "700" },
  tabMark: { width: 18, height: 3, borderRadius: 2, backgroundColor: colors.text, marginTop: 6 },
  toastLayer: { position: "absolute", left: 0, right: 0, bottom: 90, alignItems: "center", paddingHorizontal: space.l },
  toast: {
    width: "100%",
    maxWidth: 528,
    backgroundColor: colors.raised,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.l,
  },
  toastText: { ...type.body, color: colors.text, fontSize: 15 },
});
