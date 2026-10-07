// Chinese market convention: red is up, green is down.
export const colors = {
  bg: "#0B0B0E",
  card: "#15151A",
  raised: "#1D1D24",
  line: "#272730",
  text: "#F4F4F6",
  sub: "#9C9CA8",
  faint: "#62626E",
  up: "#FF4D5E",
  upSoft: "rgba(255,77,94,0.14)",
  down: "#19C98B",
  downSoft: "rgba(25,201,139,0.14)",
  accent: "#F4F4F6",
  onAccent: "#0B0B0E",
  warn: "#F5B841",
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 10, m: 14, l: 20, pill: 999 };

export const type = {
  hero: { fontSize: 44, fontWeight: "700" as const, letterSpacing: -1, fontVariant: ["tabular-nums" as const] },
  title: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3 },
  body: { fontSize: 16, fontWeight: "500" as const },
  label: { fontSize: 13, fontWeight: "600" as const, letterSpacing: 0.2 },
  small: { fontSize: 12, fontWeight: "500" as const },
  num: { fontVariant: ["tabular-nums" as const] },
};
