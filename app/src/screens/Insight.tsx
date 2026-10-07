import { useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { buyInsight, type PaidInsight } from "../api";
import { pct, usd } from "../format";
import { useStore } from "../store";
import { Button, Card, Label, Row, TxLink } from "../ui/components";
import { failure, success } from "../ui/haptics";
import { colors, space, type } from "../ui/theme";

function Spark({ points, width, height }: { points: { price: number }[]; width: number; height: number }) {
  if (points.length < 2) return null;
  const ys = points.map((p) => p.price);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.price - min) / span) * (height - 8) - 4;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = ys[ys.length - 1] >= ys[0];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={rising ? colors.up : colors.down} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

export function Insight() {
  const { session, balances, showToast, refresh } = useStore();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PaidInsight | null>(null);
  const chartWidth = Math.min(width, 560) - space.l * 4;
  const canPay = balances ? balances.usdc >= 10_000n : false;

  const buy = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const r = await buyInsight(session.account);
      success();
      setResult(r);
      setBusy(false);
      void refresh();
    } catch {
      failure();
      showToast({ tone: "error", text: "付款没有完成,再试一次" });
    } finally {
      setBusy(false);
    }
  };

  const i = result?.insight;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>两小时行情解读</Text>
      <Text style={styles.sub}>
        读的是合约结算用的同一个 Chainlink 喂价。按次付费,每次 0.01 USDC,不订阅、不注册——用的是 x402 协议,付款就是一次签名。
      </Text>

      <Card style={{ marginTop: space.l }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Label>USDC 余额</Label>
          <Text style={styles.bal}>{balances ? usd(balances.usdc) : "—"}</Text>
        </Row>
        <Button
          style={{ marginTop: space.l }}
          title={canPay ? "付 0.01 USDC 查看" : "USDC 不足"}
          busy={busy}
          disabled={!canPay}
          onPress={buy}
        />
      </Card>

      {i && (
        <Card style={{ marginTop: space.l }}>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Label>AVAX 最近两小时</Label>
              <Text style={styles.big}>${i.last.toFixed(4)}</Text>
            </View>
            <Text style={[styles.change, { color: i.changePct >= 0 ? colors.up : colors.down }]}>{pct(i.changePct)}</Text>
          </Row>
          <View style={{ marginVertical: space.l }}>
            <Spark points={i.points} width={chartWidth} height={96} />
          </View>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.stat}>最低 ${i.low.toFixed(3)}</Text>
            <Text style={styles.stat}>最高 ${i.high.toFixed(3)}</Text>
            <Text style={styles.stat}>10 分钟典型波动 {i.typicalMovePct.toFixed(2)}%</Text>
          </Row>
          <Text style={styles.summary}>
            {`两小时内在 $${i.low.toFixed(3)}–$${i.high.toFixed(3)} 之间,整体${i.changePct >= 0 ? "上涨" : "下跌"} ${Math.abs(
              i.changePct,
            ).toFixed(2)}%。每 10 分钟典型波动约 ${i.typicalMovePct.toFixed(2)}%,止损设得比这还紧,大概率会被正常波动打掉。`}
          </Text>
          {result?.settlementTx && <TxLink hash={result.settlementTx} label="这次付款的链上结算" />}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, paddingBottom: 120, maxWidth: 560, width: "100%", alignSelf: "center" },
  title: { ...type.title, color: colors.text, marginTop: space.s },
  sub: { ...type.body, color: colors.sub, marginTop: space.s, lineHeight: 22, fontSize: 15 },
  bal: { ...type.body, ...type.num, color: colors.text, fontWeight: "700" },
  big: { ...type.title, ...type.num, color: colors.text, fontSize: 28, marginTop: 2 },
  change: { ...type.title, ...type.num },
  stat: { ...type.small, color: colors.sub },
  summary: { ...type.body, color: colors.text, marginTop: space.l, lineHeight: 23, fontSize: 15 },
});
