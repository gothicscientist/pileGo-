import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// pileGo!'s own tokens (apps/web/src/styles/app.css), light theme.
export const C = {
  paper: "#f4f0e6",
  paper2: "#e8e2d2",
  card: "#fffdf6",
  ink: "#22241e",
  ink2: "#4b4e44",
  muted: "#77786c",
  line: "#dcd4c0",
  accent: "#56703f",
  accentDeep: "#3e5430",
  accentInk: "#fbf8ee",
  olive: "#78836e",
  pink: "#eeb2c6",
  rose: "#c2476f",
  tomato: "#e0533a",
  butter: "#f2cd5c",
  sky: "#9ccbe8",
  lilac: "#cdb6ea",
  kraft: "#d9c49c",
  kraftDeep: "#b39a6d",
  kraftInk: "#3a3125",
  tape: "rgba(242, 205, 92, 0.62)",
  // Dark mode tokens, for the finale.
  night: "#161813",
  night2: "#1f221b",
  nightInk: "#f2efe4",
  nightAccent: "#a8c68a",
};

// The brand face: Libre Franklin (variable weight), black italic with tight
// tracking for the wordmark and headlines. Instrument Serif adds the editorial
// accent and DM Mono is the typewriter on the tags. Bundled in public/fonts so
// renders never depend on a font CDN.
export const franklin = "Libre Franklin";
export const serif = "Instrument Serif";
export const mono = "DM Mono";

const font = (family: string, file: string, style: "normal" | "italic", weight: string) =>
  loadFont({ family, url: staticFile(`fonts/${file}`), style, weight, format: "woff2" });

export const fontsReady = Promise.all([
  font(franklin, "libre-franklin-latin-wght-normal.woff2", "normal", "100 900"),
  font(franklin, "libre-franklin-latin-wght-italic.woff2", "italic", "100 900"),
  font(serif, "instrument-serif-latin-400-italic.woff2", "italic", "400"),
  font(serif, "instrument-serif-latin-400-normal.woff2", "normal", "400"),
  font(mono, "dm-mono-latin-400-normal.woff2", "normal", "400"),
  font(mono, "dm-mono-latin-500-normal.woff2", "normal", "500"),
]);

export const FPS = 30;
export const W = 1920;
export const H = 1080;

// 120 BPM: a beat is 15 frames, a bar is 60.
export const BEAT = 15;
export const BAR = 60;

export const shadowRGB = "40 36 24";
