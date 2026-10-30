import React from "react";
import { AbsoluteFill, Freeze, Img, staticFile, useCurrentFrame } from "remotion";
import { Paper } from "../components/Paper";
import { Garment, kraftBg, MonoLabel, Stamp, Tape } from "../components/Props";
import { printShadow, Screen } from "../components/Screen";
import { headlineItalic, MaskWords } from "../components/Type";
import { garment } from "../data/registry";
import { S2Scan, SCAN_LEN } from "./S2Scan";
import { ease, keys, mix, sp, springs, tween } from "../lib/anim";
import { C, franklin, mono, serif, shadowRGB } from "../theme";

/**
 * 10.9–16.7s. One listing, six marketplaces. "Save and cross-list" opens the
 * real cross-list sheet with all six marketplaces ticked; "List on 6
 * marketplaces" sends the bomber out as six listing cards, each with the
 * method and fees the sheet showed. Then one sells, and the rest come down.
 */

export { CROSS_LEN } from "../layout";
const PRESS = 30; // "List on 6 marketplaces"
const DEAL = 42; // cards leave the deck
const SOLD = 124; // Vinted sells
const DOWN = 136; // the other five come down

// From the real cross-list sheet for a $30 listing (public/ui/crosslist-card-*.png).
export const MARKETS = [
  { id: "ebay", name: "eBay", method: "Automatic", keep: "$25.52", title: "Title 62/80" },
  { id: "vinted", name: "Vinted", method: "One click", keep: "$30", title: "Title 62/100" },
  { id: "depop", name: "Depop", method: "Auto-post", keep: "$28.56", title: "No title field" },
  { id: "poshmark", name: "Poshmark", method: "Auto-post", keep: "$24", title: "Title 62/80" },
  { id: "mercari", name: "Mercari", method: "Auto-post", keep: "$25.63", title: "Title 62/80" },
  { id: "grailed", name: "Grailed", method: "Auto-post", keep: "$25.76", title: "Title 51/60" },
];
const SOLD_ON = 1; // Vinted

// The dialog capture is 896x828 app px; the list button sits at (20, 772).
const DIALOG = { w: 896, h: 828, scale: 1.18 };
const LIST_BTN = { x: 20, y: 772, w: 219, h: 44 };

const CARD_W = 262;
const CARD_H = 380;

export const S3CrossList: React.FC = () => {
  const frame = useCurrentFrame();

  // The real sheet.
  const sheetIn = sp(frame, 0, springs.firm);
  const sheetOut = tween(frame, [PRESS + 4, DEAL + 6], [0, 1], ease.in);
  const press = keys(frame, [PRESS - 1, PRESS + 1, PRESS + 6], [1, 0.94, 1], ease.out);
  const ring = tween(frame, [PRESS - 14, PRESS - 6], [0, 1], ease.out) * (1 - tween(frame, [PRESS + 3, PRESS + 9], [0, 1]));
  const dw = DIALOG.w * DIALOG.scale;
  const dh = DIALOG.h * DIALOG.scale;
  const dx = 960 - dw / 2;
  const dy = 540 - dh / 2 + (1 - sheetIn) * 120 + sheetOut * 60;

  // Headline.
  const swap = tween(frame, [SOLD + 4, SOLD + 14], [0, 1], ease.inOut);

  return (
    <AbsoluteFill>
      <Paper />

      {/* The review page stays under the sheet, dimmed, as it does in the app. */}
      {sheetOut < 1 && (
        <AbsoluteFill style={{ opacity: 1 - sheetOut, filter: `blur(${sheetIn * 3}px)` }}>
          <Freeze frame={SCAN_LEN - 1}>
            <S2Scan />
          </Freeze>
        </AbsoluteFill>
      )}

      {/* Dim the table under the sheet, as the app does. */}
      <AbsoluteFill style={{ background: `rgb(${shadowRGB} / ${0.28 * sheetIn * (1 - sheetOut)})` }} />

      {sheetOut < 1 && (
        <div
          style={{
            position: "absolute",
            left: dx,
            top: dy,
            width: dw,
            height: dh,
            opacity: 1 - sheetOut,
            scale: String(mix(0.96, 1, sheetIn) * mix(1, 0.9, sheetOut)),
            filter: `blur(${sheetOut * 6}px)`,
            borderRadius: 28,
            boxShadow: printShadow(0.6),
          }}
        >
          <Screen src="crosslist-dialog-6.png" natural={{ w: DIALOG.w, h: DIALOG.h }} width={dw} radius={28} />
          <div
            style={{
              position: "absolute",
              left: (LIST_BTN.x - 6) * DIALOG.scale,
              top: (LIST_BTN.y - 6) * DIALOG.scale,
              width: (LIST_BTN.w + 12) * DIALOG.scale,
              height: (LIST_BTN.h + 12) * DIALOG.scale,
              borderRadius: 16,
              border: `4px solid ${C.accent}`,
              opacity: ring,
              scale: String(mix(1.2, 1, ring) * press),
            }}
          />
        </div>
      )}

      {/* Headline: one listing → six marketplaces, then the sale. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center", opacity: 1 - swap }}>
        <MaskWords words={["One", "listing."]} at={DEAL + 4} size={112} wordStyle={headlineItalic} />
        <div style={{ width: 34 }} />
        <MaskWords
          words={["Six", "marketplaces."]}
          at={DEAL + 12}
          size={124}
          gap={0.2}
          wordStyle={{ fontFamily: serif, fontStyle: "italic", color: C.accent, letterSpacing: "-0.01em" }}
        />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center", opacity: swap }}>
        <MaskWords words={["Sold", "on", "one?"]} at={SOLD + 6} size={104} wordStyle={headlineItalic} />
        <div style={{ width: 34 }} />
        <MaskWords
          words={["Gone", "everywhere", "else."]}
          at={SOLD + 14}
          size={116}
          gap={0.2}
          wordStyle={{ fontFamily: serif, fontStyle: "italic", color: C.tomato, letterSpacing: "-0.01em" }}
        />
      </div>

      {/* The six listing cards. */}
      {frame >= DEAL - 6 &&
        MARKETS.map((m, i) => <ListingCard key={m.id} i={i} frame={frame} />)}

      <MonoLabel
        size={20}
        color={C.muted}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 46,
          textAlign: "center",
          textTransform: "none",
          letterSpacing: "0.02em",
          opacity: tween(frame, [DEAL + 40, DEAL + 52], [0, 1]) * (1 - swap),
        }}
      >
        eBay through its official API · Vinted, Depop, Poshmark, Mercari and Grailed through the free pileGo! browser extension
      </MonoLabel>
    </AbsoluteFill>
  );
};

const ListingCard: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const m = MARKETS[i];
  const n = MARKETS.length;
  const c = i - (n - 1) / 2;
  // Dealt from the deck in the middle of the sheet, one per 8th note.
  const deal = sp(frame, DEAL + i * 4, { damping: 16, stiffness: 110, mass: 0.9 });
  const isSold = i === SOLD_ON;
  const center = isSold ? tween(frame, [DOWN + 4, DOWN + 26], [0, 1], ease.inOut) : 0;
  const x = mix(mix(960, 960 + c * (CARD_W + 30), deal), 960, center);
  const y = mix(600, 610 + c * c * 9, deal);
  const r = mix(-6 + i * 2.5, c * 2.2, deal);
  const lift = 1 - deal;

  // The sale: the sold card rises and gets stamped; the rest drop away.
  const sold = i === SOLD_ON;
  const stamp = sp(frame, SOLD, springs.pop);
  const soldLift = sold ? sp(frame, SOLD - 6, springs.firm) : 0;
  const order = sold ? 0 : Math.abs(i - SOLD_ON);
  const down = sold ? 0 : tween(frame, [DOWN + order * 3, DOWN + order * 3 + 18], [0, 1], ease.in);
  const strike = sold ? 0 : tween(frame, [DOWN - 6 + order * 3, DOWN + 2 + order * 3], [0, 1], ease.out);

  const g = garment("rust-bomber");
  return (
    <div
      style={{
        position: "absolute",
        left: x - CARD_W / 2,
        top: y - CARD_H / 2 - soldLift * 30 + down * 700,
        width: CARD_W,
        height: CARD_H,
        rotate: `${r + down * (i < SOLD_ON ? -14 : 14)}deg`,
        scale: String(1 + soldLift * 0.12),
        zIndex: sold ? 10 : n - Math.abs(c),
        opacity: 1 - tween(down, [0.6, 1], [0, 1]),
        background: C.card,
        borderRadius: 6,
        boxShadow: `0 1px 1px rgb(${shadowRGB} / 0.12), 0 ${10 + lift * 30 + soldLift * 20}px ${22 + lift * 40 + soldLift * 30}px -8px rgb(${shadowRGB} / ${0.3 + soldLift * 0.1})`,
      }}
    >
      {/* Marketplace tab, taped to the top. */}
      <div
        style={{
          position: "absolute",
          left: 16,
          top: -24,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px 8px 10px",
          borderRadius: 999,
          background: C.card,
          boxShadow: `0 2px 6px rgb(${shadowRGB} / 0.18)`,
          fontFamily: franklin,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: "-0.02em",
          color: C.ink,
        }}
      >
        <Img src={staticFile(`marketplaces/${m.id}.png`)} style={{ width: 30, height: 30, borderRadius: 99 }} />
        {m.name}
      </div>
      <Tape w={70} h={24} style={{ right: 18, top: -10, rotate: `${8 - i * 3}deg` }} />

      {/* The photo. */}
      <div style={{ position: "absolute", left: 14, top: 36, width: CARD_W - 28, height: 196, background: "#efe9dc", borderRadius: 4, overflow: "hidden" }}>
        <Garment src={g.src} x={(CARD_W - 28) / 2} y={100} w={156} rot={-2} lift={0.1} />
      </div>

      <div style={{ position: "absolute", left: 18, right: 18, top: 246, fontFamily: franklin, fontWeight: 700, fontSize: 24, lineHeight: 1.1, letterSpacing: "-0.025em", color: C.ink }}>
        Rust satin bomber jacket
      </div>
      <div style={{ position: "absolute", left: 18, right: 18, top: 306, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 15, color: C.muted, letterSpacing: "0.04em" }}>
        <span style={{ color: C.ink, fontWeight: 500 }}>$30</span>
        <span>{m.title.toUpperCase()}</span>
      </div>
      <div style={{ position: "absolute", left: 18, right: 18, top: 330, height: 1.5, background: C.line }} />
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: franklin, fontWeight: 700, fontSize: 20, color: C.accent, letterSpacing: "-0.01em" }}>{m.method}</span>
        <span style={{ fontFamily: franklin, fontWeight: 500, fontSize: 18, color: C.ink2 }}>
          keep <b style={{ fontWeight: 800, color: C.ink }}>{m.keep}</b>
        </span>
      </div>

      {sold && stamp > 0 && (
        <Stamp
          text="Sold"
          size={74}
          style={{ left: 40, top: 110, rotate: `${-14 + (1 - stamp) * 8}deg`, scale: String(mix(1.8, 1, stamp)), opacity: Math.min(1, stamp * 2) }}
        />
      )}
      {!sold && strike > 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `rgb(244 240 230 / ${strike * 0.6})`, borderRadius: 6 }}>
          <div
            style={{
              ...kraftBg,
              fontFamily: mono,
              fontSize: 19,
              letterSpacing: "0.08em",
              color: C.kraftInk,
              padding: "8px 14px",
              rotate: "-6deg",
              opacity: strike,
              scale: String(mix(1.4, 1, strike)),
            }}
          >
            TAKEN DOWN
          </div>
        </div>
      )}
    </div>
  );
};
