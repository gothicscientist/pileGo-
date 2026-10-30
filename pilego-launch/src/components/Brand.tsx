import React from "react";
import { C, franklin } from "../theme";

/** pileGo!'s mark: a kraft hang tag on a loop of string (apps/web Shell.tsx). */
export const TagMark: React.FC<{ size: number; ink?: string; hole?: string; style?: React.CSSProperties }> = ({
  size,
  ink = C.ink2,
  hole = C.paper,
  style,
}) => (
  <svg viewBox="0 0 32 32" width={size} height={size} style={style}>
    <path d="M16 2.5 C 10 2.5, 9 9, 13.5 10.5" fill="none" stroke={ink} strokeWidth="1.3" strokeLinecap="round" />
    <path d="M11 8 H21 L26 13 V28 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 V13 Z" fill={C.kraft} />
    <circle cx="16" cy="12.5" r="2" fill={hole} />
    <path d="M10.5 19.5 H21.5 M10.5 24 H18" stroke={C.kraftInk} strokeWidth="1.7" strokeLinecap="round" opacity="0.55" />
  </svg>
);

/**
 * The wordmark: black italic Libre Franklin with tight tracking and a tomato
 * bang. `bang` lets the "!" jump and tilt independently.
 */
export const Wordmark: React.FC<{
  size: number;
  color?: string;
  bangLift?: number;
  bangTilt?: number;
  markRot?: number;
  markScale?: number;
  showMark?: boolean;
  hole?: string;
}> = ({ size, color = C.ink, bangLift = 0, bangTilt = 0, markRot = -10, markScale = 1, showMark = true, hole }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.1 }}>
    {showMark && (
      <TagMark
        size={size * 1.12}
        hole={hole}
        style={{ rotate: `${markRot}deg`, scale: String(markScale), transformOrigin: "50% 10%" }}
      />
    )}
    <span
      style={{
        fontFamily: franklin,
        fontWeight: 900,
        fontStyle: "italic",
        fontSize: size,
        letterSpacing: "-0.055em",
        lineHeight: 1,
        color,
        whiteSpace: "nowrap",
      }}
    >
      pileGo
      <span
        style={{
          display: "inline-block",
          color: C.tomato,
          transformOrigin: "50% 100%",
          translate: `0 ${-bangLift}px`,
          rotate: `${bangTilt}deg`,
        }}
      >
        !
      </span>
    </span>
  </div>
);
