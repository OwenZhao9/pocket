import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { readCiphertext } from "../journal";
import { clock } from "../format";
import { useStore } from "../store";
import { Button, Card, Label, Row, TxLink } from "../ui/components";
import { colors, radius, space, type } from "../ui/theme";

const KIND = { open: "开仓", close: "平仓", rule: "规则", note: "笔记" } as const;

export function Journal() {
  const { session, journal, record } = useStore();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [cipher, setCipher] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    if (session) readCiphertext(session.account.address).then(setCipher);
  }, [session, journal]);

  const save = async () => {
    if (!note.trim()) return;
    setSaving(true);
    await record({ kind: "note", text: note.trim() });
    setNote("");
    setSaving(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>交易日记</Text>
      <Text style={styles.sub}>
        每笔交易自动记一条,你也可以写下当时为什么这么做。整本日记用你的通行密钥派生出的另一把钥匙加密,存在这台设备上——不上传,别人拿到文件也读不出来。
      </Text>

      <Card style={{ marginTop: space.l }}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="这次为什么下这一单?"
          placeholderTextColor={colors.faint}
          multiline
          style={styles.input}
        />
        <Button style={{ marginTop: space.m }} title="加密保存" busy={saving} disabled={!note.trim()} onPress={save} />
      </Card>

      <Row style={{ justifyContent: "space-between", marginTop: space.xl, marginBottom: space.m }}>
        <Label>{journal.length} 条记录</Label>
        {cipher && (
          <Text style={styles.peek} onPress={() => setPeek(!peek)}>
            {peek ? "收起" : "看看存的是什么"}
          </Text>
        )}
      </Row>
      {peek && cipher && (
        <Card style={{ marginBottom: space.m }}>
          <Label>设备上实际存储的内容(AES-256-GCM 密文)</Label>
          <Text style={styles.cipher} numberOfLines={6}>
            {cipher}
          </Text>
        </Card>
      )}

      {journal.map((e) => (
        <View key={`${e.at}-${e.text}`} style={styles.entry}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.kind}>{KIND[e.kind]}</Text>
            <Text style={styles.time}>{clock(e.at)}</Text>
          </Row>
          <Text style={styles.text}>{e.text}</Text>
          {e.tx && <TxLink hash={e.tx} />}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, paddingBottom: 120, maxWidth: 560, width: "100%", alignSelf: "center" },
  title: { ...type.title, color: colors.text, marginTop: space.s },
  sub: { ...type.body, color: colors.sub, marginTop: space.s, lineHeight: 22, fontSize: 15 },
  input: {
    minHeight: 84,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.raised,
    borderRadius: radius.m,
    padding: space.m,
    textAlignVertical: "top",
  },
  peek: { ...type.small, color: colors.sub, textDecorationLine: "underline" },
  cipher: { fontFamily: "Courier", fontSize: 11, color: colors.faint, marginTop: space.s },
  entry: { paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: colors.line },
  kind: { ...type.label, color: colors.sub },
  time: { ...type.small, color: colors.faint },
  text: { ...type.body, color: colors.text, marginTop: space.xs, lineHeight: 22, fontSize: 15 },
});
