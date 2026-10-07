import { isMeraError, type PasskeyCredentialMetadata } from "@category-labs/mera";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { createAccount, storedCredential, unlock } from "../account";
import { useStore } from "../store";
import { Button } from "../ui/components";
import { failure, success } from "../ui/haptics";
import { colors, space, type } from "../ui/theme";

function explain(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE") return "这个设备的通行密钥不支持派生密钥(需要 iOS 18 / 较新的 Chrome 或 Safari)";
    if (e.code === "PASSKEY_OPERATION_FAILED") return "已取消,或这个设备上没有 Pocket 的通行密钥";
  }
  return "没有成功,再试一次";
}

export function Welcome() {
  const { setSession } = useStore();
  const [known, setKnown] = useState<PasskeyCredentialMetadata | null>(null);
  const [busy, setBusy] = useState<"create" | "unlock" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storedCredential().then(setKnown);
  }, []);

  const run = async (kind: "create" | "unlock", fn: () => Promise<Awaited<ReturnType<typeof unlock>>>) => {
    setBusy(kind);
    setError(null);
    try {
      const s = await fn();
      success();
      setSession(s);
    } catch (e) {
      failure();
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={styles.brand}>Pocket</Text>
        <Text style={styles.headline}>口袋里的交易台</Text>
        <Text style={styles.sub}>刷脸登录,选涨或跌,确认。{"\n"}没有助记词,没有杠杆,没有订单簿。</Text>
      </View>

      <View style={styles.steps}>
        {[
          ["1", "刷脸", "通行密钥就是你的钱包,私钥从不离开这台设备"],
          ["2", "选涨跌", "AVAX 涨了还是跌了,按 Chainlink 价格结算"],
          ["3", "设规则就走", "到价自动卖出,服务器替你盯盘"],
        ].map(([n, t, d]) => (
          <View key={n} style={styles.step}>
            <Text style={styles.stepNum}>{n}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{t}</Text>
              <Text style={styles.stepDesc}>{d}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {known ? (
          <Button title="刷脸解锁" busy={busy === "unlock"} onPress={() => run("unlock", () => unlock(known))} />
        ) : (
          <Button title="刷脸创建账户" busy={busy === "create"} onPress={() => run("create", createAccount)} />
        )}
        <Button
          tone="ghost"
          style={{ marginTop: space.m }}
          title={known ? "用另一个通行密钥" : "我已经有账户"}
          busy={busy === "unlock" && !known}
          onPress={() => run("unlock", () => unlock(null))}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.foot}>Avalanche Fuji 测试网 · 所有资金均为测试币</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.xl, maxWidth: 520, width: "100%", alignSelf: "center" },
  top: { marginTop: space.xxl },
  brand: { ...type.label, color: colors.sub, letterSpacing: 2, textTransform: "uppercase" },
  headline: { fontSize: 38, fontWeight: "800", color: colors.text, letterSpacing: -1, marginTop: space.m },
  sub: { ...type.body, color: colors.sub, marginTop: space.m, lineHeight: 24 },
  steps: { marginTop: space.xxl, flex: 1 },
  step: { flexDirection: "row", alignItems: "flex-start", marginBottom: space.l },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.raised,
    color: colors.text,
    textAlign: "center",
    lineHeight: 28,
    fontWeight: "700",
    marginRight: space.m,
    overflow: "hidden",
  },
  stepTitle: { ...type.body, color: colors.text, fontWeight: "700" },
  stepDesc: { ...type.small, color: colors.sub, marginTop: 2, lineHeight: 18 },
  actions: { marginBottom: space.l },
  error: { ...type.small, color: colors.up, marginTop: space.m, textAlign: "center" },
  foot: { ...type.small, color: colors.faint, marginTop: space.l, textAlign: "center" },
});
