import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { parseUnits } from "viem";
import { openPosition, REVERTS, ruleLevels } from "../chain";
import { USD_DECIMALS } from "../config";
import { ago, price as fmtPrice, usd } from "../format";
import { useStore } from "../store";
import { Button, Card, Chip, Label, Row } from "../ui/components";
import { failure, success, tap } from "../ui/haptics";
import { colors, radius, space, type } from "../ui/theme";

const AMOUNTS = [5, 10, 25, 50];
const RULES = [0, 1, 2, 5];

export function Trade({ onDone }: { onDone: () => void }) {
  const { session, price, balances, onboarding, dripFailed, retryDrip, showToast, refresh, record, markTradeConfirmed } =
    useStore();
  const [isLong, setIsLong] = useState<boolean | null>(null);
  const [amount, setAmount] = useState(10);
  const [rule, setRule] = useState(1);
  const [busy, setBusy] = useState(false);

  const margin = parseUnits(String(amount), USD_DECIMALS);
  const canAfford = balances ? balances.usd >= margin : false;
  const stale = price ? Date.now() - price.updatedAt > 60 * 60 * 1000 : false;

  const submit = async () => {
    if (!session || !price || isLong === null) return;
    setBusy(true);
    try {
      const { tp, sl } = ruleLevels(isLong, price.price, rule);
      const { hash } = await openPosition(session.account, isLong, margin, tp, sl);
      success();
      const side = isLong ? "看涨" : "看跌";
      showToast({ text: `已成交 · ${side} ${amount} pUSD · 入场 ${fmtPrice(price.price)}`, tx: hash });
      await record({
        kind: "open",
        text: `${side} ${amount} pUSD,入场 ${fmtPrice(price.price)}${rule ? `,涨跌 ${rule}% 自动卖出` : ""}`,
        tx: hash,
      });
      setBusy(false);
      setIsLong(null);
      markTradeConfirmed();
      onDone();
      void refresh();
    } catch (e) {
      failure();
      const msg = (e as Error).message ?? "";
      showToast({
        tone: "error",
        text: msg.includes(REVERTS.invalidTriggers)
          ? "价格刚刚更新,规则需要按新价格重设,再点一次"
          : msg.includes(REVERTS.stalePrice)
            ? "价格源暂时没有更新,稍后再试"
            : msg.includes(REVERTS.insufficientLiquidity)
              ? "资金池暂时不够,换个小一点的金额"
              : "没有成交,再试一次",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.priceBlock}>
        <Label>AVAX / USD</Label>
        <Text style={styles.price}>{price ? fmtPrice(price.price) : "—"}</Text>
        <Text style={[styles.meta, stale && { color: colors.warn }]}>
          {price ? `Chainlink 喂价 · ${ago(price.updatedAt)}更新 · 约每 10 分钟一次` : "读取价格…"}
        </Text>
      </View>

      <Card style={{ marginBottom: space.l }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Label>可用</Label>
          <Text style={styles.balance}>
            {onboarding ? "正在发放新手资金…" : balances ? `${usd(balances.usd)} pUSD` : "—"}
          </Text>
        </Row>
        {dripFailed && (
          <Row style={{ justifyContent: "space-between", marginTop: space.m }}>
            <Text style={styles.dripFailed}>新手资金没领到(网络繁忙)</Text>
            <Button tone="ghost" style={{ height: 38 }} title="重新领取" onPress={retryDrip} />
          </Row>
        )}
      </Card>

      <Label style={styles.section}>你觉得接下来</Label>
      <Row style={{ gap: space.m }}>
        {[true, false].map((long) => {
          const on = isLong === long;
          const c = long ? colors.up : colors.down;
          return (
            <Pressable
              key={String(long)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                tap();
                setIsLong(long);
              }}
              style={[
                styles.side,
                { borderColor: on ? c : colors.line, backgroundColor: on ? (long ? colors.upSoft : colors.downSoft) : colors.card },
              ]}
            >
              <Text style={[styles.sideArrow, { color: c }]}>{long ? "↑" : "↓"}</Text>
              <Text style={styles.sideText}>{long ? "看涨" : "看跌"}</Text>
            </Pressable>
          );
        })}
      </Row>

      <Label style={styles.section}>放多少</Label>
      <Row style={{ flexWrap: "wrap" }}>
        {AMOUNTS.map((a) => (
          <Chip key={a} title={`${a} pUSD`} selected={amount === a} onPress={() => setAmount(a)} />
        ))}
      </Row>

      <Label style={styles.section}>人走开时,自动卖出</Label>
      <Row style={{ flexWrap: "wrap" }}>
        {RULES.map((r) => (
          <Chip key={r} title={r === 0 ? "不设" : `涨跌 ${r}%`} selected={rule === r} onPress={() => setRule(r)} />
        ))}
      </Row>
      <Text style={styles.hint}>
        {rule === 0
          ? "不设规则就需要你自己回来平仓。"
          : `价格朝你看的方向走 ${rule}% 就止盈,反方向走 ${rule}% 就止损。条件写在合约里,服务器只负责去触发,碰不到你的钱。`}
      </Text>

      <Button
        style={{ marginTop: space.xl }}
        tone={isLong === null ? "accent" : isLong ? "up" : "down"}
        disabled={isLong === null || !canAfford || !price || stale}
        busy={busy}
        title={
          isLong === null
            ? "先选涨或跌"
            : !canAfford
              ? "余额不足"
              : `确认${isLong ? "看涨" : "看跌"} ${amount} pUSD`
        }
        onPress={submit}
      />
      <Text style={styles.foot}>涨跌幅度和价格变动一致,不加杠杆。最多亏掉本金,最多赚到本金的一倍。</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, paddingBottom: 120, maxWidth: 560, width: "100%", alignSelf: "center" },
  priceBlock: { marginTop: space.s, marginBottom: space.xl },
  price: { ...type.hero, color: colors.text, marginTop: space.xs },
  meta: { ...type.small, color: colors.sub, marginTop: space.xs },
  balance: { ...type.body, ...type.num, color: colors.text, fontWeight: "700" },
  dripFailed: { ...type.small, color: colors.warn },
  section: { marginTop: space.xl, marginBottom: space.m },
  side: {
    flex: 1,
    height: 104,
    borderRadius: radius.l,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sideArrow: { fontSize: 34, fontWeight: "800" },
  sideText: { ...type.body, color: colors.text, fontWeight: "700", marginTop: 2 },
  hint: { ...type.small, color: colors.sub, lineHeight: 18, marginTop: space.xs },
  foot: { ...type.small, color: colors.faint, textAlign: "center", marginTop: space.m, lineHeight: 18 },
});
