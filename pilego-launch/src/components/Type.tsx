import React from "react";
import { useCurrentFrame } from "remotion";
import { ease, sp, springs, tween } from "../lib/anim";
import { C, franklin } from "../theme";

export type Word = { t: string; style?: React.CSSProperties; key?: string };

/**
 * Editorial type reveal: each word rises out of its own baseline mask, then
 * leaves upward. Times are local frames.
 */
export const MaskWords: React.FC<{
  words: (Word | string)[];
  at: number;
  out?: number;
  stagger?: number;
  size: number;
  style?: React.CSSProperties;
  wordStyle?: React.CSSProperties;
  gap?: number;
}> = ({ words, at, out, stagger = 4, size, style, wordStyle, gap = 0.24 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * gap, ...style }}>
      {words.map((w, i) => {
        const word = typeof w === "string" ? { t: w } : w;
        const inP = sp(frame, at + i * stagger, springs.firm);
        const outP = out === undefined ? 0 : tween(frame, [out + i * 2, out + i * 2 + 12], [0, 1], ease.in);
        const y = (1 - inP) * 105 - outP * 105;
        return (
          <span
            key={word.key ?? `${word.t}-${i}`}
            style={{
              display: "inline-block",
              overflow: "hidden",
              paddingBottom: size * 0.14,
              marginBottom: -size * 0.14,
              paddingRight: size * 0.06,
              marginRight: -size * 0.06,
            }}
          >
            <span
              style={{
                display: "inline-block",
                translate: `0 ${y}%`,
                rotate: `${(1 - inP) * 4}deg`,
                opacity: inP < 0.02 || outP > 0.98 ? 0 : 1,
                transformOrigin: "0% 100%",
                fontSize: size,
                lineHeight: 1,
                ...wordStyle,
                ...word.style,
              }}
            >
              {word.t}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const headline: React.CSSProperties = {
  fontFamily: franklin,
  fontWeight: 900,
  letterSpacing: "-0.05em",
  color: C.ink,
};

export const headlineItalic: React.CSSProperties = {
  ...headline,
  fontStyle: "italic",
};

/** A marker stroke that draws across text, left to right. */
export const Strike: React.FC<{
  progress: number;
  width: number;
  color?: string;
  thickness?: number;
  style?: React.CSSProperties;
}> = ({ progress, width, color = C.tomato, thickness = 14, style }) => (
  <svg
    width={width + 40}
    height={thickness * 4}
    viewBox={`0 0 ${width + 40} ${thickness * 4}`}
    style={{ position: "absolute", overflow: "visible", ...style }}
  >
    <path
      d={`M 10 ${thickness * 2.4} C ${width * 0.3} ${thickness * 1.6}, ${width * 0.65} ${thickness * 2.6}, ${width + 30} ${thickness * 1.5}`}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
      opacity={0.92}
    />
  </svg>
);

/** A hand-drawn underline swoosh. */
export const Underline: React.FC<{
  progress: number;
  width: number;
  color?: string;
  thickness?: number;
  style?: React.CSSProperties;
}> = ({ progress, width, color = C.accent, thickness = 10, style }) => (
  <svg width={width} height={thickness * 3} viewBox={`0 0 ${width} ${thickness * 3}`} style={{ position: "absolute", overflow: "visible", ...style }}>
    <path
      d={`M ${thickness} ${thickness * 1.8} Q ${width * 0.5} ${thickness * 0.6}, ${width - thickness} ${thickness * 1.4}`}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
    />
  </svg>
);
