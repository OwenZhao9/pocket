import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { closePosition, ruleLevels, setRule, type Position } from "../chain";
import { ago, clock, pct, price as fmtPrice, usd } from "../format";
import { useStore } from "../store";
import { Button, Card, Chip, Label, Row } from "../ui/components";
import { failure, success } from "../ui/haptics";
import { colors, space, type } from "../ui/theme";

function pnl(p: Position): { amount: bigint; pct: number } | null {
  const v = p.open ? p.value : p.payout;
  if (v === undefined) return null;
  const amount = v - p.margin;
  return { amount, pct: (Number(amount) / Number(p.margin)) * 100 };
}

function ruleText(p: Position): string {
  if (p.takeProfit === 0n && p.stopLoss === 0n) return "没有自动规则";
  const parts = [];
  if (p.takeProfit) parts.push(`到 ${fmtPrice(p.takeProfit)} 止盈`);
  if (p.stopLoss) parts.push(`到 ${fmtPrice(p.stopLoss)} 止损`);
  return parts.join(" · ");
}

const toneOf = (amount: bigint) => (amount > 0n ? colors.up : amount < 0n ? colors.down : colors.text);

function OpenCard({ p }: { p: Position }) {
  const { session, price, showToast, refresh, record } = useStore();
  const [busy, setBusy] = useState<"close" | "rule" | null>(null);
  const [editing, setEditing] = useState(false);
  const r = pnl(p);
  const tone = r ? toneOf(r.amount) : colors.text;

  const close = async () => {
    if (!session) return;
    setBusy("close");
    try {
      const hash = await closePosition(session.account, p.id);
      success();
      showToast({ text: "已平仓,钱回到了余额里", tx: hash });
      await record({ kind: "close", text: `手动平仓 #${p.id},到手约 ${usd(p.value ?? 0n)} pUSD`, tx: hash });
      await refresh();
    } catch {
      failure();
      showToast({ tone: "error", text: "平仓没有成功,再试一次" });
    } finally {
      setBusy(null);
    }
  };

  const applyRule = async (pctMove: number) => {
    if (!session || !price) return;
    setBusy("rule");
    try {
      // Levels are measured from the entry so they stay valid against the contract's check.
      const { tp, sl } = ruleLevels(p.isLong, p.entryPrice, pctMove);
      const hash = await setRule(session.account, p.id, tp, sl);
      success();
      setEditing(false);
      showToast({ text: pctMove ? `规则已上链:涨跌 ${pctMove}% 自动卖出` : "规则已取消", tx: hash });
      await record({ kind: "rule", text: pctMove ? `#${p.id} 设为涨跌 ${pctMove}% 自动卖出` : `#${p.id} 取消规则`, tx: hash });
      await refresh();
    } catch {
      failure();
      showToast({ tone: "error", text: "价格已经越过这个位置,换一个幅度" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.card}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={[styles.side, { color: p.isLong ? colors.up : colors.down }]}>
          {p.isLong ? "↑ 看涨" : "↓ 看跌"} <Text style={styles.margin}>{usd(p.margin)} pUSD</Text>
        </Text>
        <Text style={styles.time}>{ago(p.openedAt)}</Text>
      </Row>
      <Row style={{ justifyContent: "space-between", marginTop: space.m }}>
        <View>
          <Label>现在值</Label>
          <Text style={styles.value}>{p.value !== undefined ? `${usd(p.value)}` : "—"}</Text>
        </View>
        {r && (
          <View style={{ alignItems: "flex-end" }}>
            <Label>盈亏</Label>
            <Text style={[styles.value, { color: tone }]}>
              {r.amount >= 0n ? "+" : "-"}
              {usd(r.amount >= 0n ? r.amount : -r.amount)} · {pct(r.pct)}
            </Text>
          </View>
        )}
      </Row>
      <Text style={styles.detail}>入场 {fmtPrice(p.entryPrice)} · {ruleText(p)}</Text>

      {editing ? (
        <Row style={{ flexWrap: "wrap", marginTop: space.m }}>
          {[0, 1, 2, 5].map((m) => (
            <Chip key={m} title={m === 0 ? "取消规则" : `涨跌 ${m}%`} selected={false} onPress={() => applyRule(m)} />
          ))}
        </Row>
      ) : null}

      <Row style={{ gap: space.m, marginTop: space.m }}>
        <Button tone="ghost" style={{ flex: 1, height: 46 }} title={editing ? "收起" : "改规则"} busy={busy === "rule"} onPress={() => setEditing(!editing)} />
        <Button style={{ flex: 1, height: 46 }} title="平仓" busy={busy === "close"} onPress={close} />
      </Row>
    </Card>
  );
}

function ClosedCard({ p }: { p: Position }) {
  const r = pnl(p);
  const tone = r ? toneOf(r.amount) : colors.text;
  return (
    <View style={styles.closed}>
      <View style={{ flex: 1 }}>
        <Text style={styles.closedTitle}>
          {p.isLong ? "看涨" : "看跌"} {usd(p.margin)} · {fmtPrice(p.entryPrice)} → {fmtPrice(p.exitPrice)}
        </Text>
        <Text style={styles.time}>
          {clock(p.closedAt)} {p.closedByTrigger ? "· 规则自动卖出" : "· 手动平仓"}
        </Text>
      </View>
      {r && <Text style={[styles.closedPnl, { color: tone }]}>{pct(r.pct)}</Text>}
    </View>
  );
}

export function Positions() {
  const { positions, keeper } = useStore();
  const open = positions.filter((p) => p.open);
  const closed = positions.filter((p) => !p.open);
  const auto = closed.filter((p) => p.closedByTrigger).length;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Card style={styles.keeper}>
        <Row>
          <View style={[styles.dot, { backgroundColor: keeper?.last && Date.now() - keeper.last.at < 3 * 60_000 ? colors.down : colors.warn }]} />
          <Text style={styles.keeperText}>
            {keeper?.last
              ? `规则引擎 ${ago(keeper.last.at)}检查过 ${keeper.last.scanned} 个仓位`
              : "规则引擎状态读取中…"}
          </Text>
        </Row>
        <Text style={styles.keeperSub}>每分钟在服务器上跑一次。它只能在合约确认价格到位时触发,钱永远打回你的地址。</Text>
      </Card>

      <Label style={styles.section}>持仓中 {open.length ? `· ${open.length}` : ""}</Label>
      {open.length === 0 ? <Text style={styles.empty}>还没有持仓。去「交易」选个方向。</Text> : open.map((p) => <OpenCard key={String(p.id)} p={p} />)}

      {closed.length > 0 && (
        <>
          <Label style={styles.section}>
            已结束 · {closed.length} 笔{auto ? `,其中 ${auto} 笔由规则自动卖出` : ""}
          </Label>
          <Card style={{ paddingVertical: space.s }}>
            {closed.map((p) => (
              <ClosedCard key={String(p.id)} p={p} />
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, paddingBottom: 120, maxWidth: 560, width: "100%", alignSelf: "center" },
  keeper: { marginTop: space.s },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: space.s },
  keeperText: { ...type.body, color: colors.text, fontWeight: "600", flex: 1 },
  keeperSub: { ...type.small, color: colors.sub, marginTop: space.s, lineHeight: 18 },
  section: { marginTop: space.xl, marginBottom: space.m },
  empty: { ...type.body, color: colors.sub },
  card: { marginBottom: space.m },
  side: { ...type.body, fontWeight: "800" },
  margin: { color: colors.text, fontWeight: "600" },
  time: { ...type.small, color: colors.faint, marginTop: 2 },
  value: { ...type.title, ...type.num, color: colors.text, marginTop: 2 },
  detail: { ...type.small, color: colors.sub, marginTop: space.m },
  closed: { flexDirection: "row", alignItems: "center", paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: colors.line },
  closedTitle: { ...type.body, ...type.num, color: colors.text, fontSize: 14 },
  closedPnl: { ...type.body, ...type.num, fontWeight: "700", marginLeft: space.m },
});
