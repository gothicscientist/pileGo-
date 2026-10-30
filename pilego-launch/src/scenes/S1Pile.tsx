import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Garment, Polaroid, PriceTag, Tape } from "../components/Props";
import { Paper } from "../components/Paper";
import { printShadow, Screen } from "../components/Screen";
import { headlineItalic, MaskWords, Strike } from "../components/Type";
import { Viewfinder } from "../components/Viewfinder";
import { garment } from "../data/registry";
import { COVER, CROP, onPrint, PRINT, SCAN_START, STACK } from "../layout";
import { drift, ease, keys, mix, sp, springs, tween } from "../lib/anim";
import { C, DARK_MODE, serif } from "../theme";

/**
 * 0–6.2s. The hook and the snap. Real garments fall onto the paper floor in
 * time with the music and pile up under the cover line. On the drop (4.0s) the
 * rust bomber is picked out of the pile, the camera finds it, the shutter
 * fires, and the photo it takes slides into pileGo!'s real scan page.
 */

type Drop = { g: string; x: number; y: number; w: number; r: number; at: number };

// The pile, bottom to top. `at` is the landing frame, on the 8th notes.
export const PILE: Drop[] = [
  { g: "striped-knit-sweater", x: 560, y: 905, w: 430, r: -8, at: 14 },
  { g: "jeans", x: 1510, y: 820, w: 290, r: 18, at: 19 },
  { g: "green-cable-vest", x: 1190, y: 890, w: 400, r: 6, at: 24 },
  { g: "floral-tea-dress", x: 360, y: 770, w: 230, r: -14, at: 29 },
  { g: "red-cardigan", x: 810, y: 760, w: 370, r: -10, at: 34 },
  { g: "lilac-sweater", x: 1680, y: 660, w: 290, r: 12, at: 40 },
  { g: "denim-jacket", x: 1390, y: 690, w: 350, r: -6, at: 44 },
  { g: "blue-sweater-tulips", x: 620, y: 620, w: 330, r: 8, at: 49 },
  { g: "brogues", x: 1740, y: 960, w: 250, r: -10, at: 55 },
  { g: "cap", x: 290, y: 985, w: 240, r: -12, at: 59 },
  { g: "silk-scarf", x: 1010, y: 980, w: 250, r: 24, at: 64 },
  { g: "beanie", x: 1250, y: 600, w: 160, r: 14, at: 68 },
  { g: "rust-bomber", x: 1080, y: 690, w: 380, r: -7, at: 74 },
];

const HERO = "rust-bomber";
export const PICK = 120; // the drop: the bomber leaves the pile
export const SNAP = 150; // shutter
const TRAVEL = 160; // the photo starts moving into the app

export const S1Pile: React.FC = () => {
  const frame = useCurrentFrame();
  const heroIdx = PILE.findIndex((p) => p.g === HERO);

  // Camera: a slow push into the pile; on the drop the pile sinks and goes
  // soft as the bomber is picked out of it.
  const push = tween(frame, [0, PICK], [1, 1.04], ease.soft);
  const pick = sp(frame, PICK - 2, springs.smooth);
  const camX = drift(frame, 1, 4);
  const camY = drift(frame, 2, 3);
  const pileAway = tween(frame, [TRAVEL - 4, SCAN_START], [0, 1], ease.inOut);

  // Cover line.
  const strikeP = tween(frame, [58, 70], [0, 1], ease.inOut);
  const fix = sp(frame, 68, springs.pop);
  const headOut = tween(frame, [PICK - 8, PICK + 6], [0, 1], ease.in);

  // The hero: lifted out of the pile, straightened, brought forward.
  const hero = PILE[heroIdx];
  const lift = sp(frame, PICK, { damping: 18, stiffness: 70, mass: 1 });
  const hx = mix(hero.x, 980, lift);
  const hy = mix(hero.y, 520, lift) + drift(frame, 7, 4 * lift);
  const hw = mix(hero.w, 500, lift);
  const hr = mix(hero.r, -1.5, lift) + drift(frame, 3, 0.8 * lift);

  // Viewfinder, shutter, and the photo developing.
  const vf = sp(frame, 130, springs.firm);
  // A softer, shorter flash on the dark grade, so it reads as a shutter, not a white frame.
  const flash = keys(frame, [SNAP - 1, SNAP, SNAP + (DARK_MODE ? 5 : 7)], [0, DARK_MODE ? 0.7 : 1, 0], ease.out);
  const shot = frame >= SNAP;
  const develop = tween(frame, [SNAP, SNAP + 22], [0, 1], ease.soft);

  // The photo travels into the cover slot on the scan page.
  const travel = tween(frame, [TRAVEL, SCAN_START - 2], [0, 1], ease.inOut);
  const target = onPrint(COVER);
  const polW = 600;
  const imgW = polW - 48;
  const pcx = mix(980, target.x + target.w / 2, travel);
  const pcy = mix(520, target.y + target.h / 2, travel);
  const ps = mix(1, target.w / imgW, travel);
  const frameFade = tween(frame, [SCAN_START - 12, SCAN_START - 2], [1, 0], ease.inOut);
  const printIn = tween(frame, [TRAVEL + 4, SCAN_START], [0, 1], ease.out);

  return (
    <AbsoluteFill>
      <Paper />
      <AbsoluteFill style={{ scale: String(push), translate: `${camX}px ${camY}px`, opacity: 1 - pileAway }}>
        {/* The cover line, behind the pile like a cover line behind the model. */}
        <div style={{ position: "absolute", left: 104, top: 140, opacity: 1 - headOut, translate: `0 ${-headOut * 40}px` }}>
          <MaskWords words={["That", "pile?"]} at={6} size={132} wordStyle={headlineItalic} />
          <div style={{ position: "relative", marginTop: 8 }}>
            <MaskWords words={["It’s", { t: "a mess.", key: "mess", style: { color: C.ink2 } }]} at={26} size={132} wordStyle={headlineItalic} />
            <Strike progress={strikeP} width={392} thickness={17} style={{ left: 214, top: 38 }} />
            <div
              style={{
                position: "absolute",
                left: 690,
                top: -24,
                fontFamily: serif,
                fontStyle: "italic",
                fontSize: 176,
                lineHeight: 1,
                color: C.accent,
                rotate: `${-5 + (1 - fix) * -10}deg`,
                scale: String(0.55 + fix * 0.45),
                opacity: Math.min(1, fix * 1.6),
                transformOrigin: "10% 80%",
                whiteSpace: "nowrap",
              }}
            >
              inventory.
            </div>
          </div>
        </div>

        {/* The pile. */}
        <AbsoluteFill
          style={{
            translate: `0 ${pick * 70}px`,
            scale: String(1 - pick * 0.04),
            filter: `blur(${pick * 6}px) brightness(${1 - pick * 0.08})`,
          }}
        >
          {PILE.map((p, i) => (i === heroIdx ? null : <Falling key={p.g} d={p} i={i} frame={frame} />))}
          <Tags frame={frame} />
          <SideProps frame={frame} />
        </AbsoluteFill>

        {/* The hero rides above the pile once it's picked. */}
        {!shot && <Falling d={hero} i={heroIdx} frame={frame} override={frame >= PICK ? { x: hx, y: hy, w: hw, r: hr, lift: lift * 0.9 } : undefined} />}
      </AbsoluteFill>

      {/* The scan page assembles under the photo. */}
      {printIn > 0 && (
        <div
          style={{
            position: "absolute",
            left: PRINT.x,
            top: PRINT.y,
            opacity: printIn,
            scale: String(mix(1.025, 1, printIn)),
            boxShadow: printShadow(0.25),
            borderRadius: 12,
          }}
        >
          <Screen src="scan-photos.png" crop={CROP} width={PRINT.w} radius={12} />
        </div>
      )}

      {/* Snap: what the camera saw, developing like an instant photo. */}
      {shot && (
        <div style={{ position: "absolute", left: pcx, top: pcy, scale: String(ps), opacity: frameFade > 0 ? 1 : 0 }}>
          <Polaroid
            w={polW}
            caption={frameFade > 0.7 ? "1. Front" : undefined}
            tape={false}
            style={{
              left: -polW / 2,
              top: -(24 + (imgW * 1.25) / 2),
              rotate: `${mix(-1.5, 0, travel)}deg`,
              background: `rgb(253 253 251 / ${frameFade})`,
              boxShadow: frameFade > 0.02 ? undefined : "none",
            }}
          >
            <Img
              src={staticFile("garments/rust-bomber-photo.webp")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: `saturate(${0.25 + develop * 0.75}) brightness(${1.4 - develop * 0.4}) contrast(${0.8 + develop * 0.2})`,
              }}
            />
          </Polaroid>
        </div>
      )}

      <Viewfinder
        x={980}
        y={520}
        w={620}
        h={740}
        progress={vf}
        opacity={shot ? 1 - develop : Math.min(1, vf * 1.4)}
      />

      {/* Snap. — the first word of the stack the scan scene builds on. */}
      <div style={{ position: "absolute", left: STACK.x, top: STACK.y }}>
        <MaskWords words={["Snap."]} at={PICK + 4} size={STACK.size} wordStyle={headlineItalic} />
      </div>

      <AbsoluteFill style={{ background: "#fffdf6", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

/** One garment falling in from above the frame and landing on the pile. */
const Falling: React.FC<{
  d: Drop;
  i: number;
  frame: number;
  override?: { x: number; y: number; w: number; r: number; lift: number };
}> = ({ d, i, frame, override }) => {
  const g = garment(d.g);
  if (override) {
    return <Garment src={g.src} x={override.x} y={override.y} w={override.w} rot={override.r} lift={override.lift} />;
  }
  const start = d.at - 13;
  if (frame < start) return null;
  const fall = sp(frame, start, springs.land);
  const side = i % 2 === 0 ? -1 : 1;
  const y = mix(-520, d.y, fall);
  const x = d.x + side * (1 - fall) * 160;
  const r = d.r + side * (1 - fall) * 70;
  const lift = Math.max(0, 1 - fall) * 0.8;
  const squash = keys(frame, [d.at - 1, d.at + 2, d.at + 8], [1, 0.965, 1], ease.out);
  return <Garment src={g.src} x={x} y={y} w={d.w} rot={r} lift={lift} style={{ scale: `1 ${squash}` }} />;
};

/** Kraft tags that tumble in and swing: the unlisted backlog, in tag form. */
const Tags: React.FC<{ frame: number }> = ({ frame }) => {
  const tags = [
    { price: "price?", note: "draft", x: 650, y: 610, at: 50, r: -8 },
    { price: "$24", note: "unlisted", x: 1335, y: 620, at: 66, r: 10 },
    { price: "$18", note: "draft", x: 470, y: 880, at: 80, r: 6 },
    { price: "$40", note: "unlisted", x: 1540, y: 890, at: 90, r: -12 },
  ];
  return (
    <>
      {tags.map((t, i) => {
        const p = sp(frame, t.at, springs.pop);
        const since = frame - t.at;
        const swing = since > 0 ? Math.sin(since / 5) * 14 * Math.exp(-since / 18) : 0;
        return (
          <PriceTag
            key={i}
            price={t.price}
            note={t.note}
            width={116}
            swing={t.r + swing + (1 - p) * 30}
            style={{ left: t.x, top: t.y - (1 - p) * 60, opacity: Math.min(1, p * 2) }}
          />
        );
      })}
    </>
  );
};

/** A taped polaroid and a loose strip of tape, so it reads as a scrapbook. */
const SideProps: React.FC<{ frame: number }> = ({ frame }) => {
  const p = sp(frame, 72, springs.firm);
  const t = sp(frame, 84, springs.firm);
  return (
    <>
      <Polaroid
        w={250}
        caption="Saturday haul"
        style={{ left: 1600, top: 560 + (1 - p) * 300, rotate: `${8 - (1 - p) * 20}deg`, opacity: p > 0.01 ? 1 : 0 }}
      >
        <Img src={staticFile("garments/rust-sweater.webp")} style={{ width: "84%", margin: "30% 8%", filter: "drop-shadow(0 6px 6px rgb(0 0 0 / 0.2))" }} />
      </Polaroid>
      <Tape w={160} h={40} style={{ left: 250, top: 660, rotate: "-24deg", opacity: t, scale: String(0.8 + t * 0.2) }} />
    </>
  );
};
