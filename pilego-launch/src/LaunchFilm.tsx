import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Grain } from "./components/Paper";
import { C } from "./theme";
import { TornSheet } from "./components/TornSheet";
import { CLOSET_LEN, CLOSET_START, CROSS_LEN, CROSS_START, FINALE_LEN, FINALE_START, SCAN_LEN, SCAN_START, TEAR } from "./layout";
import { Soundtrack } from "./Soundtrack";
import { ease, tween } from "./lib/anim";
import { S1Pile } from "./scenes/S1Pile";
import { S2Scan } from "./scenes/S2Scan";
import { S3CrossList } from "./scenes/S3CrossList";
import { S4Closet } from "./scenes/S4Closet";
import { S5Finale } from "./scenes/S5Finale";

/**
 * pileGo! launch film. 1920x1080, 30 fps, 28 s, cut to a 120 BPM score
 * (a beat is 15 frames, a bar is 60). Scenes hand objects to each other on
 * the same pixels where they can; otherwise a fresh sheet is torn off the pad.
 */
export { FILM_LEN } from "./layout";

/** A scene arriving on a new sheet torn from the pad. */
const Torn: React.FC<{ seed: string; children: React.ReactNode }> = ({ seed, children }) => {
  const frame = useCurrentFrame();
  return <TornSheet progress={tween(frame, [0, TEAR], [0, 1], ease.inOut)} seed={seed}>{children}</TornSheet>;
};

export const LaunchFilm: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.paper }}>
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
    <Soundtrack />
  </AbsoluteFill>
);
