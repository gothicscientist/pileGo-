import React from "react";
import { Composition, Folder } from "remotion";
import { FILM_LEN, LaunchFilm } from "./LaunchFilm";
import { SCAN_START } from "./layout";
import { S1Pile } from "./scenes/S1Pile";
import { S2Scan, SCAN_LEN } from "./scenes/S2Scan";
import { CROSS_LEN, S3CrossList } from "./scenes/S3CrossList";
import { CLOSET_LEN, S4Closet } from "./scenes/S4Closet";
import { FINALE_LEN, S5Finale } from "./scenes/S5Finale";
import { FPS, H, W } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="LaunchFilm" component={LaunchFilm} width={W} height={H} fps={FPS} durationInFrames={FILM_LEN} />
      <Folder name="Scenes">
        <Composition id="S1-Pile" component={S1Pile} width={W} height={H} fps={FPS} durationInFrames={SCAN_START} />
        <Composition id="S2-Scan" component={S2Scan} width={W} height={H} fps={FPS} durationInFrames={SCAN_LEN} />
        <Composition id="S3-CrossList" component={S3CrossList} width={W} height={H} fps={FPS} durationInFrames={CROSS_LEN} />
        <Composition id="S4-Closet" component={S4Closet} width={W} height={H} fps={FPS} durationInFrames={CLOSET_LEN} />
        <Composition id="S5-Finale" component={S5Finale} width={W} height={H} fps={FPS} durationInFrames={FINALE_LEN} />
      </Folder>
    </>
  );
};
