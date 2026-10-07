import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { EXPLORER } from "../config";
import { tap } from "./haptics";
import { colors, radius, space, type } from "./theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  busy,
  disabled,
  tone = "accent",
  style,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "accent" | "up" | "down" | "ghost";
  style?: ViewStyle;
}) {
  const bg = { accent: colors.accent, up: colors.up, down: colors.down, ghost: colors.raised }[tone];
  const fg = tone === "accent" ? colors.onAccent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({
  title,
  selected,
  onPress,
  tone,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
  tone?: "up" | "down";
}) {
  const on = tone === "up" ? colors.up : tone === "down" ? colors.down : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.chip, selected && { borderColor: on, backgroundColor: colors.raised }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.text }]}>{title}</Text>
    </Pressable>
  );
}

export function TxLink({ hash, label = "查看链上记录" }: { hash: string; label?: string }) {
  return (
    <Text style={styles.link} onPress={() => Linking.openURL(`${EXPLORER}/tx/${hash}`)}>
      {label} ↗
    </Text>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.l, padding: space.l, borderWidth: 1, borderColor: colors.line },
  label: { ...type.label, color: colors.sub, textTransform: "none" },
  button: { height: 54, borderRadius: radius.m, alignItems: "center", justifyContent: "center", paddingHorizontal: space.l },
  buttonText: { fontSize: 17, fontWeight: "700" },
  chip: {
    paddingHorizontal: space.l,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.s,
    marginBottom: space.s,
  },
  chipText: { ...type.body, color: colors.sub, fontSize: 15 },
  link: { ...type.small, color: colors.sub, textDecorationLine: "underline", marginTop: space.s },
});
