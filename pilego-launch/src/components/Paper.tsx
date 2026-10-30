import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, DARK_MODE } from "../theme";

/**
 * The floor everything sits on: pileGo!'s warm paper with its faint grid,
 * paper fibre and a soft vignette. `dark` swaps to the night palette.
 */
export const Paper: React.FC<{
  dark?: boolean;
  grid?: number;
  gridOpacity?: number;
  offsetX?: number;
  offsetY?: number;
}> = ({ dark = DARK_MODE, grid = 56, gridOpacity = 1, offsetX = 0, offsetY = 0 }) => {
  const base = C.paper;
  const line = dark ? "rgba(242,239,228,0.045)" : "rgba(60,52,30,0.055)";
  return (
    <AbsoluteFill style={{ backgroundColor: base, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          opacity: gridOpacity,
          backgroundImage: `linear-gradient(${line} 1.5px, transparent 1.5px), linear-gradient(90deg, ${line} 1.5px, transparent 1.5px)`,
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${offsetX}px ${offsetY}px`,
        }}
      />
      <Fibre dark={dark} />
      <AbsoluteFill
        style={{
          background: dark
            ? "radial-gradient(ellipse 70% 65% at 50% 42%, rgba(255,240,205,0.05) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5) 100%)"
            : "radial-gradient(ellipse 80% 75% at 50% 45%, rgba(255,250,235,0.35) 0%, rgba(0,0,0,0) 45%, rgba(70,55,25,0.16) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Static paper fibre: low-frequency blotches plus fine tooth. */
const Fibre: React.FC<{ dark: boolean }> = ({ dark }) => (
  <AbsoluteFill style={{ opacity: dark ? 0.22 : 0.35, mixBlendMode: dark ? "screen" : "multiply" }}>
    <svg width="100%" height="100%">
      <filter id="fibre">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={3} seed={4} />
        <feColorMatrix
          type="matrix"
          values={
            dark
              ? "0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0.25 0"
              : "0 0 0 0 0.55  0 0 0 0 0.47  0 0 0 0 0.33  0 0 0 0.35 0"
          }
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#fibre)" />
    </svg>
  </AbsoluteFill>
);

/**
 * Film grain over the whole frame. The seed changes every two frames so it
 * reads as grain, not as a texture sliding around.
 */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 24;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};
