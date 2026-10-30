import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Wordmark } from "../components/Brand";
import { Paper } from "../components/Paper";
import { Garment, MonoLabel, PriceTag, Starburst, Tape } from "../components/Props";
import { headlineItalic, MaskWords } from "../components/Type";
import { garment, hasGarment } from "../data/registry";
import { drift, ease, keys, mix, rnd, sp, springs, tween } from "../lib/anim";
import { C, franklin, serif } from "../theme";

/**
 * 21.3–28s. The pile, sorted out. Garments fly in from every edge and land
 * on the green mat from the sign-in page, the wordmark lands with the hit at
 * 22.0s, then the line and the address. The end card holds for four seconds.
 */

import { FINALE_LEN } from "../layout";
export { FINALE_LEN };
export const HIT = 20; // 22.0s: the chord and the wordmark
const LINE = 34; // "Less listing. More living."
const CHORD = 80; // 24.0s: the address

type Piece = { g: string; x: number; y: number; w: number; r: number; at: number };
const MAT = { x: 1010, y: 175, w: 800, h: 700, r: -3 };

// The pile on the mat, bottom to top. Landing frames step on the 16ths into the hit.
const PIECES: Piece[] = [
  { g: "striped-knit-sweater", x: 1260, y: 800, w: 400, r: -6, at: 5 },
  { g: "jeans", x: 1700, y: 600, w: 260, r: 14, at: 7 },
  { g: "green-cable-vest", x: 1600, y: 820, w: 340, r: 8, at: 9 },
  { g: "lilac-sweater", x: 1170, y: 420, w: 300, r: -12, at: 11 },
  { g: "red-cardigan", x: 1660, y: 360, w: 320, r: 10, at: 13 },
  { g: "blue-sweater-tulips", x: 1190, y: 640, w: 300, r: 6, at: 15 },
  { g: "rust-bomber", x: 1430, y: 520, w: 400, r: -4, at: 17 },
  { g: "brogues", x: 1780, y: 830, w: 200, r: -10, at: 18 },
  { g: "cap", x: 1110, y: 250, w: 220, r: -16, at: 19 },
];

export const S5Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const mat = sp(frame, 0, springs.firm);
  const bump = keys(frame, [HIT - 1, HIT + 1, HIT + 10], [1, 1.018, 1], ease.out);
  const mark = sp(frame, HIT, springs.pop);
  const bang = keys(frame, [HIT + 6, HIT + 11, HIT + 18, HIT + 26], [0, 26, -4, 0], ease.inOut);
  const tilt = keys(frame, [HIT + 6, HIT + 11, HIT + 18, HIT + 26], [0, 16, -4, 0], ease.inOut);
  const url = sp(frame, CHORD, springs.firm);
  const sticker = sp(frame, CHORD + 8, springs.pop);
  const chip = sp(frame, HIT + 14, springs.firm);
  const breathe = tween(frame, [CHORD, FINALE_LEN], [1, 1.025], ease.soft);

  return (
    <AbsoluteFill>
      <Paper />
      <AbsoluteFill style={{ scale: String(bump * breathe), translate: `${drift(frame, 5, 3)}px ${drift(frame, 9, 2)}px` }}>
        {/* The green mat from pileGo!'s sign-in page. */}
        <div
          style={{
            position: "absolute",
            left: MAT.x,
            top: MAT.y + (1 - mat) * 900,
            width: MAT.w,
            height: MAT.h,
            rotate: `${MAT.r + (1 - mat) * 8}deg`,
            borderRadius: 34,
            background: C.mat,
            backgroundImage:
              "linear-gradient(rgb(255 255 255 / 0.07) 1.5px, transparent 1.5px), linear-gradient(90deg, rgb(255 255 255 / 0.07) 1.5px, transparent 1.5px)",
            backgroundSize: "48px 48px",
            boxShadow: "0 2px 2px rgb(0 0 0 / 0.12), 0 40px 60px -30px rgb(30 30 10 / 0.5)",
          }}
        />
        {PIECES.filter((p) => hasGarment(p.g)).map((p, i) => (
          <Flyer key={p.g} p={p} i={i} frame={frame} />
        ))}
        <PriceTag
          price="$30"
          note="Sold on Vinted"
          width={150}
          swing={keys(frame, [HIT + 2, HIT + 12, HIT + 22, HIT + 34], [40, -10, 5, 0], ease.inOut) - 6}
          style={{ left: 1320, top: 520, opacity: tween(frame, [HIT, HIT + 4], [0, 1]) }}
        />

        {/* "Listed everywhere", with the six marketplaces' own icons. */}
        <div
          style={{
            position: "absolute",
            left: 1080,
            top: 132,
            rotate: "-3deg",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 24px 10px 12px",
            borderRadius: 999,
            background: C.ink,
            color: C.paper,
            fontFamily: franklin,
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: "-0.01em",
            opacity: Math.min(1, chip * 2),
            translate: `0 ${(1 - chip) * -30}px`,
            boxShadow: "0 10px 20px -8px rgb(0 0 0 / 0.4)",
          }}
        >
          <div style={{ display: "flex" }}>
            {["depop", "vinted", "ebay", "poshmark", "mercari", "grailed"].map((m, k) => (
              <Img key={m} src={staticFile(`marketplaces/${m}.png`)} style={{ width: 38, height: 38, borderRadius: 99, marginLeft: k ? -10 : 0, border: `2px solid ${C.ink}`, background: "#fff" }} />
            ))}
          </div>
          Listed everywhere
        </div>

        <Starburst
          size={210}
          style={{ left: 1650, top: 760, rotate: `${-12 + (1 - sticker) * 40}deg`, scale: String(mix(0.3, 1, sticker)), opacity: Math.min(1, sticker * 3) }}
        >
          <span style={{ fontWeight: 600, fontSize: 24 }}>Sold in</span>
          <span style={{ fontWeight: 900, fontStyle: "italic", fontSize: 54, letterSpacing: "-0.04em", lineHeight: 1 }}>2 days</span>
        </Starburst>
        <Tape w={150} h={40} style={{ left: 1720, top: 150, rotate: "28deg", opacity: chip }} />
      </AbsoluteFill>

      {/* Identity. */}
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 250,
          scale: String(mix(1.35, 1, mark)),
          opacity: Math.min(1, mark * 3),
          transformOrigin: "0% 100%",
        }}
      >
        <Wordmark size={176} bangLift={bang} bangTilt={tilt} markRot={-10 + tilt * 0.8} />
      </div>
      <div style={{ position: "absolute", left: 116, top: 500 }}>
        <MaskWords words={["Less", "listing."]} at={LINE} size={104} wordStyle={headlineItalic} />
        <div style={{ height: 6 }} />
        <MaskWords
          words={["More", "living."]}
          at={LINE + 10}
          size={124}
          gap={0.2}
          wordStyle={{ fontFamily: serif, fontStyle: "italic", color: C.accent, letterSpacing: "-0.01em" }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 830,
          display: "flex",
          alignItems: "center",
          gap: 26,
          opacity: Math.min(1, url * 1.5),
          translate: `0 ${(1 - url) * 24}px`,
        }}
      >
        <div
          style={{
            fontFamily: franklin,
            fontWeight: 800,
            fontSize: 50,
            letterSpacing: "-0.03em",
            color: C.accentInk,
            background: C.accent,
            padding: "10px 34px 14px 46px",
            clipPath: "polygon(24px 0, 100% 0, 100% 100%, 24px 100%, 0 50%)",
            position: "relative",
          }}
        >
          <span style={{ position: "absolute", left: 28, top: "50%", width: 10, height: 10, borderRadius: 99, background: C.accentInk, translate: "0 -50%" }} />
          pilego.app
        </div>
        <MonoLabel size={25} color={C.ink} style={{ lineHeight: 1.45 }}>
          Free · open source
          <br />
          for resellers
        </MonoLabel>
      </div>
    </AbsoluteFill>
  );
};

const Flyer: React.FC<{ p: Piece; i: number; frame: number }> = ({ p, i, frame }) => {
  const g = garment(p.g);
  const start = p.at - 12;
  if (frame < start) return null;
  const t = sp(frame, start, { damping: 14, stiffness: 150, mass: 0.8 });
  // In from whichever edge is nearest, spinning a little.
  const ang = rnd(`fin${i}`, 0, Math.PI * 2);
  const sx = 960 + Math.cos(ang) * 1400;
  const sy = 540 + Math.sin(ang) * 1000;
  const land = keys(frame, [p.at - 1, p.at + 2, p.at + 8], [1, 0.97, 1], ease.out);
  return (
    <Garment
      src={g.src}
      x={mix(sx, p.x, t)}
      y={mix(sy, p.y, t)}
      w={p.w}
      rot={mix(p.r + (i % 2 ? 120 : -120), p.r, t)}
      lift={Math.max(0, 1 - t) * 0.9}
      style={{ scale: `1 ${land}` }}
    />
  );
};
