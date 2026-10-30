import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// pileGo!'s own tokens (apps/web/src/styles/app.css), light and dark.
const LIGHT = {
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
  photoBg: "#efe9dc",
  mat: "#4f6a3a",
};

const DARK: typeof LIGHT = {
  paper: "#161813",
  paper2: "#1f221b",
  card: "#262a21",
  ink: "#f2efe4",
  ink2: "#cbc8b9",
  muted: "#97978a",
  line: "#363b2f",
  accent: "#a8c68a",
  accentDeep: "#c4dcaa",
  accentInk: "#141810",
  olive: "#a7b398",
  pink: "#f0b6ca",
  rose: "#f28cac",
  tomato: "#ff7b5e",
  butter: "#f4d671",
  sky: "#a6d2ee",
  lilac: "#d3bff0",
  kraft: "#c8b083",
  kraftDeep: "#a68f63",
  kraftInk: "#2a2318",
  tape: "rgba(244, 214, 113, 0.42)",
  photoBg: "#2e3228",
  mat: "#3d5530",
};

/** The film is graded in pileGo!'s dark theme. Set to "light" for the paper version. */
export const MODE: "light" | "dark" = "dark";
export const DARK_MODE = MODE === "dark";
export const C = DARK_MODE ? DARK : LIGHT;

/** Shadow colour, and how much stronger shadows must be to read on dark paper. */
export const shadowRGB = DARK_MODE ? "0 0 0" : "40 36 24";
const SHADOW_GAIN = DARK_MODE ? 1.9 : 1;
/** A shadow colour at alpha `a` (tuned on light paper), scaled for the mode. */
export const shade = (a: number) => `rgb(${shadowRGB} / ${Math.min(0.95, a * SHADOW_GAIN).toFixed(3)})`;

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

