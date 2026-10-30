import React from "react";
import { AbsoluteFill } from "remotion";
import { rnd } from "../lib/anim";
import { C, shadowRGB } from "../theme";

// A torn top edge: a jagged polygon with fibrous, uneven teeth.
const edge = (seed: string, depth: number) => {
  const pts: string[] = [];
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 100;
    const y = depth * (0.35 + 0.65 * rnd(`${seed}-${i}`)) + (i % 2) * depth * 0.25;
    pts.push(`${x}% ${y}px`);
  }
  return `polygon(${pts.join(", ")}, 100% 100%, 0% 100%)`;
};

/**
 * A new sheet of paper torn from the pad and slid over the last scene.
 * `progress` 0 = below the frame, 1 = covering it.
 */
export const TornSheet: React.FC<{ progress: number; seed?: string; children: React.ReactNode; rotate?: number }> = ({
  progress,
  seed = "a",
  children,
  rotate = -1.5,
}) => {
  const depth = 26;
  const y = (1 - progress) * 1180;
  return (
    <AbsoluteFill
      style={{
        translate: `0 ${y}px`,
        rotate: `${(1 - progress) * rotate}deg`,
        filter: progress < 1 ? `drop-shadow(0 -10px 24px rgb(${shadowRGB} / 0.28))` : undefined,
      }}
    >
      <AbsoluteFill style={{ top: -depth, height: 1080 + depth, background: C.paper, clipPath: progress < 1 ? edge(seed, depth) : undefined }}>
        <AbsoluteFill style={{ top: depth }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
