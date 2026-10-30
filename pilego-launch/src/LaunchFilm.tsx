import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Grain } from "./components/Paper";
import { TornSheet } from "./components/TornSheet";
import { SCAN_START } from "./layout";
import { ease, tween } from "./lib/anim";
import { S1Pile } from "./scenes/S1Pile";
import { S2Scan, SCAN_LEN } from "./scenes/S2Scan";
import { CROSS_LEN, S3CrossList } from "./scenes/S3CrossList";
import { CLOSET_LEN, S4Closet } from "./scenes/S4Closet";
import { FINALE_LEN, S5Finale } from "./scenes/S5Finale";

/**
 * pileGo! launch film. 1920x1080, 30 fps, 28 s, cut to a 120 BPM score
 * (a beat is 15 frames, a bar is 60). Scenes hand objects to each other on
 * the same pixels where they can; otherwise a fresh sheet is torn off the pad.
 */
export const FILM_LEN = 840;
export const CROSS_START = SCAN_START + SCAN_LEN;
const TEAR = 16;
export const CLOSET_START = CROSS_START + CROSS_LEN - TEAR;
export const FINALE_START = FILM_LEN - FINALE_LEN;

/** A scene arriving on a new sheet torn from the pad. */
const Torn: React.FC<{ seed: string; children: React.ReactNode }> = ({ seed, children }) => {
  const frame = useCurrentFrame();
  return <TornSheet progress={tween(frame, [0, TEAR], [0, 1], ease.inOut)} seed={seed}>{children}</TornSheet>;
};

export const LaunchFilm: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#f4f0e6" }}>
    <Sequence name="1 · The pile" durationInFrames={SCAN_START}>
      <S1Pile />
    </Sequence>
    <Sequence name="2 · Snap. Scan. Done." from={SCAN_START} durationInFrames={SCAN_LEN}>
      <S2Scan />
    </Sequence>
    <Sequence name="3 · One listing, six marketplaces" from={CROSS_START} durationInFrames={CROSS_LEN}>
      <S3CrossList />
    </Sequence>
    <Sequence name="4 · The whole closet" from={CLOSET_START} durationInFrames={CLOSET_LEN}>
      <Torn seed="closet">
        <S4Closet />
      </Torn>
    </Sequence>
    <Sequence name="5 · Less listing. More living." from={FINALE_START} durationInFrames={FINALE_LEN}>
      <Torn seed="finale">
        <S5Finale />
      </Torn>
    </Sequence>
    <Grain />
    <Audio src={staticFile("audio/music.wav")} />
  </AbsoluteFill>
);
