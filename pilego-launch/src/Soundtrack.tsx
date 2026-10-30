import { Audio } from "@remotion/media";
import React from "react";
import { Sequence, staticFile } from "remotion";
import { CLOSET_START, CROSS_START, FINALE_START, SCAN_START } from "./layout";
import { PILE, SNAP } from "./scenes/S1Pile";

/**
 * The score plus every sound effect, spotted to the picture by global frame.
 * Scene starts: pile 0, scan 186, cross-list 336, closet 496, finale 640.
 * Variants rotate so no sound repeats back to back.
 */
type Cue = { f: number; s: string; v?: number };

const S2 = SCAN_START;
const S3 = CROSS_START;
const S4 = CLOSET_START;
const S5 = FINALE_START;

const drops = ["fabric_drop_1", "fabric_drop_3", "fabric_drop_2", "fabric_drop_4"];
const swishes = ["fabric_swish_2", "fabric_swish_4", "fabric_swish_1", "fabric_swish_3"];

const CUES: Cue[] = [
  // 1 · The pile. Every landing gets a soft cloth thump; every other one a swish on the way down.
  ...PILE.filter((p) => p.g !== "rust-bomber").map((p, i) => ({ f: p.at - 1, s: drops[i % 4], v: 0.55 + (i % 3) * 0.08 })),
  ...PILE.filter((_, i) => i % 2 === 0).map((p, i) => ({ f: p.at - 9, s: swishes[i % 4], v: 0.32 })),
  { f: 63, s: "fabric_drop_2", v: 0.7 }, // the bomber lands on top
  { f: 50, s: "tag_flick_1", v: 0.6 },
  { f: 66, s: "tag_flick_2", v: 0.55 },
  { f: 80, s: "tag_flick_3", v: 0.5 },
  { f: 90, s: "tag_flick_1", v: 0.45 },
  { f: 57, s: "paper_slide_2", v: 0.45 }, // the marker strike
  { f: 68, s: "ui_pop_1", v: 0.5 }, // "inventory."
  { f: 72, s: "paper_slide_1", v: 0.4 }, // polaroid
  { f: 84, s: "tape_rip_2", v: 0.35 },
  { f: 118, s: "whoosh_soft_2", v: 0.5 }, // the bomber is picked out
  { f: 121, s: "fabric_swish_1", v: 0.55 },
  { f: 132, s: "ui_tick_1", v: 0.45 }, // focus
  { f: 138, s: "ui_tick_3", v: 0.35 },
  { f: SNAP - 1, s: "shutter_1", v: 0.9 },
  { f: 162, s: "whoosh_soft_3", v: 0.35 }, // the photo travels into the app
  { f: 182, s: "paper_slide_3", v: 0.35 },

  // 2 · Snap. Scan. Done.
  { f: S2 + 15, s: "ui_tick_2", v: 0.65 }, // Scan with AI
  { f: S2 + 17, s: "scan_sweep_1", v: 0.45 },
  { f: S2 + 40, s: "scan_sweep_2", v: 0.3 },
  { f: S2 + 34, s: "ui_tick_4", v: 0.3 },
  { f: S2 + 48, s: "ui_tick_1", v: 0.3 },
  { f: S2 + 63, s: "ui_confirm_1", v: 0.5 }, // Check it over
  { f: S2 + 64, s: "ai_sparkle_1", v: 0.45 },
  { f: S2 + 76, s: "whoosh_soft_1", v: 0.3 }, // push in
  { f: S2 + 92, s: "type_2", v: 0.35 }, // fields scrolling by
  { f: S2 + 110, s: "ai_sparkle_2", v: 0.25 },
  { f: S2 + 106, s: "tag_flick_2", v: 0.45 }, // $30 tag
  { f: S2 + 135, s: "ui_tick_3", v: 0.65 }, // Save and cross-list

  // 3 · One listing, six marketplaces.
  { f: S3 + 1, s: "paper_slide_1", v: 0.45 }, // the sheet opens
  { f: S3 + 29, s: "ui_tick_2", v: 0.65 }, // List on 6 marketplaces
  { f: S3 + 38, s: "paper_shuffle_1", v: 0.6 },
  { f: S3 + 50, s: "paper_shuffle_3", v: 0.45 },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ f: S3 + 44 + i * 4, s: `paper_slide_${(i % 3) + 1}`, v: 0.22 })),
  { f: S3 + 123, s: "stamp_1", v: 0.85 }, // SOLD
  { f: S3 + 126, s: "cash_1", v: 0.4 },
  { f: S3 + 134, s: "paper_shuffle_2", v: 0.5 }, // the rest come down
  { f: S3 + 140, s: "whoosh_soft_2", v: 0.3 },

  // 4 · The whole closet.
  { f: S4, s: "tape_rip_1", v: 0.6 }, // a sheet torn off the pad
  { f: S4 + 8, s: "fabric_swish_3", v: 0.45 },
  { f: S4 + 14, s: "fabric_swish_2", v: 0.35 },
  { f: S4 + 22, s: "fabric_drop_1", v: 0.45 },
  { f: S4 + 28, s: "fabric_drop_3", v: 0.4 },
  { f: S4 + 34, s: "fabric_drop_4", v: 0.4 },
  { f: S4 + 36, s: "tag_flick_3", v: 0.5 },
  { f: S4 + 40, s: "tag_flick_1", v: 0.45 },
  { f: S4 + 44, s: "tag_flick_2", v: 0.45 },
  { f: S4 + 46, s: "stamp_2", v: 0.6 },
  { f: S4 + 48, s: "tag_flick_3", v: 0.4 },
  { f: S4 + 76, s: "paper_slide_2", v: 0.55 }, // Out there slides in
  { f: S4 + 104, s: "ui_pop_2", v: 0.35 },
  { f: S4 + 109, s: "ui_pop_3", v: 0.3 },
  { f: S4 + 117, s: "ui_tick_4", v: 0.7 }, // Relist 3 old listings
  { f: S4 + 124, s: "tag_flick_1", v: 0.5 },
  { f: S4 + 128, s: "tag_flick_2", v: 0.45 },
  { f: S4 + 132, s: "tag_flick_3", v: 0.45 },
  { f: S4 + 134, s: "ui_confirm_2", v: 0.45 }, // toast

  // 5 · Finale.
  { f: S5, s: "tape_rip_2", v: 0.55 },
  { f: S5 + 2, s: "fabric_swish_4", v: 0.4 },
  { f: S5 + 6, s: "fabric_swish_1", v: 0.35 },
  { f: S5 + 9, s: "fabric_drop_2", v: 0.35 },
  { f: S5 + 13, s: "fabric_drop_4", v: 0.35 },
  { f: S5 + 17, s: "fabric_drop_1", v: 0.4 },
  { f: S5 + 20, s: "impact_soft_1", v: 0.35 }, // 22.0 s, with the score's hit
  { f: S5 + 25, s: "ui_pop_1", v: 0.45 }, // the bang jumps
  { f: S5 + 22, s: "tag_flick_2", v: 0.4 },
  { f: S5 + 80, s: "paper_slide_3", v: 0.3 }, // pilego.app, on the final chord
  { f: S5 + 88, s: "stamp_2", v: 0.45 }, // sticker
];

export const Soundtrack: React.FC = () => (
  <>
    <Audio src={staticFile("audio/music.wav")} volume={0.9} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={c.f} name={`sfx ${c.s}`} layout="none">
        <Audio src={staticFile(`audio/sfx/${c.s}.wav`)} volume={c.v ?? 0.5} />
      </Sequence>
    ))}
  </>
);
