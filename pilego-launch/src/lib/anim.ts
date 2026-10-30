import { Easing, interpolate, random, spring, SpringConfig } from "remotion";
import { FPS } from "../theme";

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.55, 0, 1, 0.45),
  soft: Easing.bezier(0.33, 1, 0.68, 1),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
};

/** Clamped interpolate with an optional easing. */
export const tween = (
  frame: number,
  input: [number, number],
  output: [number, number],
  easing: (t: number) => number = ease.out,
) =>
  interpolate(frame, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** Multi-stop clamped interpolate. */
export const keys = (
  frame: number,
  input: number[],
  output: number[],
  easing: (t: number) => number = ease.inOut,
) =>
  interpolate(frame, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

export const springs = {
  // Settles fast with a touch of overshoot: a garment landing.
  land: { damping: 13, stiffness: 140, mass: 0.9 } as Partial<SpringConfig>,
  // No overshoot: UI and camera moves.
  smooth: { damping: 200, stiffness: 90, mass: 1 } as Partial<SpringConfig>,
  // Snappy with a visible bounce: tags, stamps, stickers.
  pop: { damping: 10, stiffness: 180, mass: 0.6 } as Partial<SpringConfig>,
  firm: { damping: 22, stiffness: 160, mass: 0.8 } as Partial<SpringConfig>,
};

export const sp = (
  frame: number,
  delay: number,
  config: Partial<SpringConfig> = springs.smooth,
  durationInFrames?: number,
) =>
  spring({ frame: frame - delay, fps: FPS, config, durationInFrames });

/** Deterministic random in [a, b). */
export const rnd = (seed: string | number, a = 0, b = 1) =>
  a + random(`pilego-${seed}`) * (b - a);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A slow, organic wobble for hand-held drift. */
export const drift = (frame: number, seed: number, amp = 1, speed = 1) =>
  amp *
  (Math.sin((frame / FPS) * 0.9 * speed + seed) * 0.6 +
    Math.sin((frame / FPS) * 1.7 * speed + seed * 2.3) * 0.4);
