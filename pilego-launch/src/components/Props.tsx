import React from "react";
import { Img, staticFile } from "remotion";
import { C, DARK_MODE, franklin, mono, shade } from "../theme";

/**
 * A real garment cutout. `lift` is how far it is off the paper (0 = lying
 * flat, 1 = held up high): the shadow grows, softens and drifts away from the
 * silhouette as it rises, which sells the depth more than any scale change.
 */
export const Garment: React.FC<{
  src: string;
  x: number;
  y: number;
  w: number;
  rot?: number;
  lift?: number;
  scale?: number;
  opacity?: number;
  flip?: boolean;
  blur?: number;
  brightness?: number;
  z?: number;
  style?: React.CSSProperties;
}> = ({ src, x, y, w, rot = 0, lift = 0, scale = 1, opacity = 1, flip = false, blur = 0, brightness = 1, z, style }) => {
  const dy = 3 + lift * 34;
  const dx = lift * 10;
  const b = 3 + lift * 30;
  const a = 0.3 - lift * 0.12;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        translate: "-50% -50%",
        rotate: `${rot}deg`,
        scale: `${flip ? -scale : scale} ${scale}`,
        opacity,
        zIndex: z,
        filter: [
          `drop-shadow(${dx * 0.3}px ${1 + lift * 4}px ${1.5 + lift * 3}px ${shade(0.32 - lift * 0.2)})`,
          `drop-shadow(${dx}px ${dy}px ${b}px ${shade(a)})`,
          blur > 0 ? `blur(${blur}px)` : "",
          brightness !== 1 ? `brightness(${brightness})` : "",
        ].join(" "),
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", display: "block" }} />
    </div>
  );
};

/** Kraft card texture, the same speckle the app uses for its hang tags. */
export const kraftBg: React.CSSProperties = {
  backgroundColor: C.kraft,
  backgroundImage:
    "radial-gradient(rgb(255 255 255 / 0.2) 1px, transparent 1.2px), radial-gradient(rgb(80 60 30 / 0.14) 0.9px, transparent 1.1px)",
  backgroundSize: "7px 7px, 10px 10px",
  backgroundPosition: "0 0, 3px 4px",
};

/**
 * A kraft hang tag on a loop of string, like the ones on the pile. Pivots
 * from the string hole, so `swing` reads as a real tag swinging.
 */
export const PriceTag: React.FC<{
  price: string;
  note?: string;
  width?: number;
  swing?: number;
  string?: boolean;
  style?: React.CSSProperties;
}> = ({ price, note, width = 120, swing = 0, string = true, style }) => {
  const s = width / 120;
  return (
    <div style={{ position: "absolute", width, transformOrigin: "50% 0%", rotate: `${swing}deg`, ...style }}>
      {string && (
        <svg
          width={60 * s}
          height={46 * s}
          viewBox="0 0 60 46"
          style={{ position: "absolute", left: width / 2 - 30 * s, top: -34 * s, overflow: "visible" }}
        >
          <path d="M30 40 C 22 30, 20 8, 32 4 C 44 0, 46 18, 34 30" fill="none" stroke={C.ink2} strokeWidth={1.6} strokeLinecap="round" />
        </svg>
      )}
      <div
        style={{
          ...kraftBg,
          position: "relative",
          clipPath: "polygon(24% 0, 76% 0, 100% 16%, 100% 100%, 0 100%, 0 16%)",
          borderRadius: 8 * s,
          padding: `${30 * s}px ${10 * s}px ${16 * s}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: C.kraftInk,
          filter: `drop-shadow(0 ${2 * s}px ${2 * s}px rgb(0 0 0 / 0.1))`,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 11 * s,
            left: "50%",
            width: 12 * s,
            height: 12 * s,
            translate: "-50% 0",
            borderRadius: 99,
            background: C.paper,
            boxShadow: "inset 0 1px 2px rgb(0 0 0 / 0.45)",
          }}
        />
        <span style={{ fontFamily: franklin, fontWeight: 700, fontSize: 38 * s, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {price}
        </span>
        {note && (
          <span style={{ fontFamily: franklin, fontWeight: 600, fontSize: 15 * s, marginTop: 6 * s, opacity: 0.75, whiteSpace: "nowrap" }}>
            {note}
          </span>
        )}
      </div>
    </div>
  );
};

/** Washi tape: translucent butter yellow with a faint weave and torn ends. */
export const Tape: React.FC<{
  w?: number;
  h?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ w = 130, h = 36, color = C.tape, style }) => (
  <div
    style={{
      position: "absolute",
      width: w,
      height: h,
      background: `repeating-linear-gradient(90deg, rgb(0 0 0 / 0.03) 0 2px, transparent 2px 6px), ${color}`,
      clipPath: "polygon(2% 8%, 5% 0, 97% 6%, 100% 18%, 98% 100%, 94% 92%, 3% 96%, 0 84%)",
      boxShadow: "0 1px 1px rgb(0 0 0 / 0.06)",
      ...style,
    }}
  />
);

/** An instant photo with a wide chin for a caption. */
export const Polaroid: React.FC<{
  w: number;
  children: React.ReactNode;
  caption?: string;
  style?: React.CSSProperties;
  tape?: boolean;
}> = ({ w, children, caption, style, tape = true }) => {
  const s = w / 300;
  return (
    <div
      style={{
        position: "absolute",
        width: w,
        background: "#fdfdfb",
        padding: `${12 * s}px ${12 * s}px ${58 * s}px`,
        borderRadius: 3,
        boxShadow: `0 2px 2px rgb(0 0 0 / 0.08), 0 ${28 * s}px ${44 * s}px -${22 * s}px rgb(0 0 0 / 0.45)`,
        ...style,
      }}
    >
      {tape && <Tape w={110 * s} h={30 * s} style={{ top: -15 * s, left: "50%", translate: "-50% 0", rotate: "-3deg" }} />}
      <div style={{ width: "100%", aspectRatio: "4 / 5", overflow: "hidden", position: "relative", background: "#ece6d8" }}>{children}</div>
      {caption && (
        <div
          style={{
            position: "absolute",
            left: 16 * s,
            right: 16 * s,
            bottom: 18 * s,
            fontFamily: franklin,
            fontWeight: 500,
            fontSize: 19 * s,
            letterSpacing: "-0.01em",
            color: "#53575a",
            whiteSpace: "nowrap",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
};

/** A rubber stamp, slightly uneven ink, set at an angle. */
export const Stamp: React.FC<{
  text: string;
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}> = ({ text, color = C.tomato, size = 64, style }) => (
  <div
    style={{
      position: "absolute",
      padding: `${size * 0.12}px ${size * 0.32}px`,
      border: `${size * 0.075}px solid ${color}`,
      borderRadius: size * 0.16,
      color,
      fontFamily: franklin,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 1,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      background: DARK_MODE ? "rgb(38 42 33 / 0.88)" : "rgb(255 253 246 / 0.82)",
      mixBlendMode: DARK_MODE ? "normal" : "multiply",
      WebkitMaskImage:
        "radial-gradient(circle at 30% 40%, #000 60%, rgb(0 0 0 / 0.75) 61%, #000 70%), radial-gradient(circle at 70% 70%, #000 50%, rgb(0 0 0 / 0.8) 80%)",
      ...style,
    }}
  >
    {text}
  </div>
);

/** A scalloped sticker, like the "Sold in 2 days" one on the sign-in page. */
export const Starburst: React.FC<{
  size: number;
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ size, color = C.tomato, children, style }) => {
  const pts: string[] = [];
  const n = 18;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 50 : 43;
    const a = (i / (n * 2)) * Math.PI * 2;
    pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
  }
  return (
    <div style={{ position: "absolute", width: size, height: size, ...style }}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 6px 8px rgb(0 0 0 / 0.25))" }}>
        <polygon points={pts.join(" ")} fill={color} strokeLinejoin="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff8ee",
          fontFamily: franklin,
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** A small typed label, like a museum card or a garment care label. */
export const MonoLabel: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = 18,
  color = C.ink2,
  style,
}) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: size,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);
