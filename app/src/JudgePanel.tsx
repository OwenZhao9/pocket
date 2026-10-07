import { Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { evidence, REPO_URL } from "./evidence";
import { ago } from "./format";
import { useStore } from "./store";
import { colors, radius, space, type } from "./ui/theme";

/// Shown beside the app on wide screens, where judges most likely open the link.
export function JudgePanel() {
  const { keeper } = useStore();
  const keeperFresh = keeper?.last && Date.now() - keeper.last.at < 3 * 60_000;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.wrap}>
      <Text style={styles.eyebrow}>评委通道</Text>
      <Text style={styles.title}>这是一个 iOS 原生应用</Text>
      <Text style={styles.body}>
        左边是同一套代码导出的网页版,功能和 iPhone 上一样。点「刷脸创建账户」开始,几秒后自动到账 100 pUSD——不用装钱包,不用领水。
      </Text>

      <View style={styles.qrRow}>
        <Image source={require("../assets/judge-qr.png")} style={styles.qr} />
        <Text style={[styles.body, { flex: 1, marginTop: 0 }]}>
          用手机扫码打开。iPhone 的 Safari 和安卓的 Chrome 都支持通行密钥。
        </Text>
      </View>

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: keeperFresh ? colors.down : colors.warn }]} />
        <Text style={styles.statusText}>
          {keeper?.last ? `规则引擎 ${ago(keeper.last.at)}运行过,检查了 ${keeper.last.scanned} 个仓位` : "读取规则引擎状态…"}
        </Text>
      </View>

      <Text style={styles.section}>用到的 Avalanche 能力 · 每一项都能在链上核对</Text>
      {evidence.map((e) => (
        <View key={e.title} style={styles.item}>
          <Text style={styles.itemTitle}>{e.title}</Text>
          <Text style={styles.itemBody}>{e.body}</Text>
          <Text style={styles.link} onPress={() => Linking.openURL(e.link)}>
            {e.linkText} ↗
          </Text>
        </View>
      ))}

      <Text style={[styles.link, { marginTop: space.l }]} onPress={() => Linking.openURL(REPO_URL)}>
        代码仓库与 README ↗
      </Text>
      <Text style={styles.foot}>Avalanche Fuji 测试网 · 所有资金均为测试币</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.l, paddingRight: space.l },
  eyebrow: { ...type.label, color: colors.sub, letterSpacing: 2 },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, marginTop: space.s, letterSpacing: -0.5 },
  body: { ...type.body, fontSize: 15, color: colors.sub, lineHeight: 23, marginTop: space.m },
  qrRow: { flexDirection: "row", alignItems: "center", gap: space.l, marginTop: space.xl },
  qr: { width: 120, height: 120, borderRadius: radius.m },
  status: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space.xl,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: space.s },
  statusText: { ...type.small, color: colors.text, fontSize: 13 },
  section: { ...type.label, color: colors.text, marginTop: space.xl, marginBottom: space.s },
  item: { paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { ...type.body, color: colors.text, fontWeight: "700", fontSize: 15 },
  itemBody: { ...type.small, color: colors.sub, lineHeight: 19, marginTop: 4, fontSize: 13 },
  link: { ...type.small, color: colors.text, textDecorationLine: "underline", marginTop: 6, fontSize: 13 },
  foot: { ...type.small, color: colors.faint, marginTop: space.xl },
});
