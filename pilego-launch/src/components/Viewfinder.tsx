import React from "react";
import { C } from "../theme";
import { MonoLabel } from "./Props";

/** Camera corner brackets that close in on a subject, plus a shot label. */
export const Viewfinder: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  progress: number;
  opacity?: number;
  label?: string;
  color?: string;
}> = ({ x, y, w, h, progress, opacity = 1, label, color = C.ink }) => {
  const spread = (1 - progress) * 90;
  const L = 64;
  const t = 6;
  const corner = (cx: number, cy: number, sx: number, sy: number, key: string) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: cx + sx * spread - (sx > 0 ? L : 0),
        top: cy + sy * spread - (sy > 0 ? L : 0),
        width: L,
        height: L,
        borderColor: color,
        borderStyle: "solid",
        borderWidth: 0,
        borderLeftWidth: sx < 0 ? t : 0,
        borderRightWidth: sx > 0 ? t : 0,
        borderTopWidth: sy < 0 ? t : 0,
        borderBottomWidth: sy > 0 ? t : 0,
        borderRadius: 6,
      }}
    />
  );
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, opacity }}>
      {corner(0, 0, -1, -1, "tl")}
      {corner(w, 0, 1, -1, "tr")}
      {corner(0, h, -1, 1, "bl")}
      {corner(w, h, 1, 1, "br")}
      <div
        style={{
          position: "absolute",
          left: w / 2 - 22,
          top: h / 2 - 22,
          width: 44,
          height: 44,
          opacity: progress * 0.7,
        }}
      >
        <div style={{ position: "absolute", left: 21, top: 0, width: 2, height: 44, background: color }} />
        <div style={{ position: "absolute", top: 21, left: 0, height: 2, width: 44, background: color }} />
      </div>
      {label && (
        <MonoLabel
          size={22}
          color={color}
          style={{ position: "absolute", left: -spread, top: -spread - 46, opacity: progress, fontWeight: 500 }}
        >
          {label}
        </MonoLabel>
      )}
    </div>
  );
};
