import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Paper } from "../components/Paper";
import { Garment, kraftBg, MonoLabel, Stamp } from "../components/Props";
import { printShadow, Screen } from "../components/Screen";
import { headlineItalic, MaskWords } from "../components/Type";
import { garment, hasGarment } from "../data/registry";
import { ease, keys, mix, rnd, sp, springs, tween } from "../lib/anim";
import { C, franklin, serif } from "../theme";

/**
 * 17–22.7s. Your whole closet, handled. The pile sorts itself into the
 * closet's real status tabs (Drafts, Ready, Listed, Sold), then a sheet slides
 * in with the real "Out there" page: the old listings, and one press of
 * "Relist 3 old listings".
 */

export { CLOSET_LEN } from "../layout";
const SORT = 6; // garments start flying to their columns
const OUT = 78; // the Out there print slides in
const PRESS = 118; // "Relist 3 old listings"

// The closet's real tabs and counts (public/ui/closet-rack.png).
const COLUMNS = [
  { label: "Drafts", count: 3, items: ["cream-turtleneck", "lilac-sweater", "beanie"] },
  { label: "Ready", count: 4, items: ["jeans", "red-cardigan", "cap"] },
  { label: "Listed", count: 7, items: ["denim-jacket", "green-cable-vest", "blue-sweater-tulips"] },
  { label: "Sold", count: 2, items: ["rust-bomber"] },
];

// Rows of the Out there "Live" list (public/ui/out-live.png, app CSS px).
const LIVE = { w: 1104, h: 875 };
const LIVE_CROP = { x: 0, y: 0, w: 1104, h: 352 };
const ROW_Y = (i: number) => 47 + i * 76.5; // top of row i
const DAYS_X = [184, 184, 187, 193]; // where "66 days" / "41 days" sits in each row
const RELIST_ROWS = [0, 2, 3]; // anorak on eBay; jeans on eBay and Vinted
const RELIST_BTN = { x: 958, y: 0, w: 146, h: 44 };

export const S4Closet: React.FC = () => {
  const frame = useCurrentFrame();
  const out = sp(frame, OUT, springs.smooth);
  const sortAway = tween(frame, [OUT - 4, OUT + 18], [0, 1], ease.inOut);

  return (
    <AbsoluteFill>
      <Paper />

      {/* Headline. */}
      <div style={{ position: "absolute", left: 104, top: 64, display: "flex", alignItems: "baseline", opacity: 1 - sortAway, translate: `0 ${-sortAway * 30}px` }}>
        <MaskWords words={["Your", "whole", "closet,"]} at={4} size={108} wordStyle={headlineItalic} />
        <div style={{ width: 30 }} />
        <MaskWords
          words={["handled."]}
          at={16}
          size={128}
          wordStyle={{ fontFamily: serif, fontStyle: "italic", color: C.accent }}
        />
      </div>

      {/* The sort: four columns under real closet tabs. */}
      <AbsoluteFill style={{ translate: `0 ${-sortAway * 140}px`, opacity: 1 - sortAway, filter: `blur(${sortAway * 4}px)` }}>
        {COLUMNS.map((col, ci) => (
          <Column key={col.label} ci={ci} frame={frame} />
        ))}
      </AbsoluteFill>

      {/* Out there: the real Live list. */}
      {frame >= OUT - 6 && (
        <AbsoluteFill style={{ translate: `0 ${(1 - out) * 1100}px` }}>
          <div style={{ position: "absolute", left: 104, top: 70, display: "flex", alignItems: "baseline" }}>
            <MaskWords words={["Old", "listings?"]} at={OUT + 6} size={104} wordStyle={headlineItalic} />
            <div style={{ width: 30 }} />
            <MaskWords
              words={["One", "press."]}
              at={OUT + 14}
              size={120}
              gap={0.2}
              wordStyle={{ fontFamily: serif, fontStyle: "italic", color: C.accent }}
            />
          </div>
          <LiveList frame={frame} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const COL_X = [330, 750, 1170, 1590];

const Column: React.FC<{ ci: number; frame: number }> = ({ ci, frame }) => {
  const col = COLUMNS[ci];
  const items = col.items.filter(hasGarment);
  const tab = sp(frame, SORT + 30 + ci * 4, springs.pop);
  const cx = COL_X[ci];
  return (
    <>
      {items.map((name, k) => {
        const idx = ci * 3 + k;
        // Each piece starts where it lay in the mess and flies to its stack, on 8th notes.
        const at = SORT + idx * 3;
        const p = sp(frame, at, { damping: 15, stiffness: 120, mass: 0.9 });
        const sx = rnd(`sx${idx}`, 260, 1660);
        const sy = rnd(`sy${idx}`, 520, 980);
        const sr = rnd(`sr${idx}`, -40, 40);
        const tx = cx + (k - (items.length - 1) / 2) * 52;
        const ty = 720 - k * 64;
        const g = garment(name);
        const w = name === "beanie" || name === "cap" ? 200 : name === "jeans" ? 220 : 300;
        const lift = Math.sin(Math.PI * Math.min(1, p)) * 0.7;
        return (
          <Garment
            key={name}
            src={g.src}
            x={mix(sx, tx, p)}
            y={mix(sy, ty, p) - lift * 60}
            w={w}
            rot={mix(sr, (k - 1) * 4 + (ci % 2 ? 2 : -2), p)}
            lift={lift}
            z={10 - k}
          />
        );
      })}
      {/* The tab, as a kraft label on a tack. */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: 960,
          translate: "-50% 0",
          scale: String(mix(0.6, 1, tab)),
          opacity: Math.min(1, tab * 2),
          rotate: `${(ci % 2 ? 2 : -2) + (1 - tab) * 10}deg`,
          ...kraftBg,
          padding: "10px 24px 12px",
          borderRadius: 6,
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          boxShadow: "0 3px 6px rgb(0 0 0 / 0.15)",
          zIndex: 20,
        }}
      >
        <span style={{ fontFamily: franklin, fontWeight: 800, fontSize: 40, letterSpacing: "-0.03em", color: C.kraftInk }}>{col.label}</span>
        <span style={{ fontFamily: franklin, fontWeight: 600, fontSize: 30, color: C.kraftInk, opacity: 0.7 }}>{col.count}</span>
      </div>
      {col.label === "Sold" && (
        <Stamp
          text="Sold"
          size={56}
          style={{
            left: cx - 90,
            top: 600,
            zIndex: 30,
            rotate: "-12deg",
            scale: String(mix(1.8, 1, sp(frame, SORT + 40, springs.pop))),
            opacity: Math.min(1, sp(frame, SORT + 40, springs.pop) * 2),
          }}
        />
      )}
    </>
  );
};

const LiveList: React.FC<{ frame: number }> = ({ frame }) => {
  const k = 1.6;
  const w = LIVE_CROP.w * k;
  const left = (1920 - w) / 2;
  const top = 270;
  const press = keys(frame, [PRESS - 1, PRESS + 1, PRESS + 6], [1, 0.93, 1], ease.out);
  const ring = tween(frame, [PRESS - 16, PRESS - 6], [0, 1], ease.out) * (1 - tween(frame, [PRESS + 4, PRESS + 10], [0, 1]));
  const toast = sp(frame, PRESS + 8, springs.firm);
  return (
    <>
      <div style={{ position: "absolute", left, top, rotate: "-0.6deg", boxShadow: printShadow(0.3), borderRadius: 18, background: C.paper, padding: "26px 0 14px" }}>
        <Screen src="out-live.png" natural={LIVE} crop={LIVE_CROP} width={w} />
        {/* The old-age warning, called out in the app's own red. */}
        {RELIST_ROWS.map((r, i) => {
          const at = PRESS + 6 + i * 4;
          const p = sp(frame, at, springs.pop);
          const flag = sp(frame, OUT + 26 + i * 5, springs.pop);
          return (
            <React.Fragment key={r}>
              <div
                style={{
                  position: "absolute",
                  left: (DAYS_X[r] - 6) * k,
                  top: 26 + (ROW_Y(r) + 33) * k,
                  width: 60 * k,
                  height: 24 * k,
                  borderRadius: 999,
                  border: `3px solid ${C.tomato}`,
                  opacity: Math.min(1, flag * 2) * (1 - p),
                  scale: String(mix(1.4, 1, flag)),
                }}
              />
              {p > 0.001 && (
                <div
                  style={{
                    position: "absolute",
                    left: 560 * k,
                    top: 26 + (ROW_Y(r) + 12) * k,
                    ...kraftBg,
                    fontFamily: franklin,
                    fontWeight: 800,
                    fontSize: 30,
                    letterSpacing: "-0.01em",
                    color: C.kraftInk,
                    padding: "6px 18px 8px",
                    borderRadius: 6,
                    rotate: `${-3 + i * 2.5}deg`,
                    scale: String(mix(1.6, 1, p)),
                    opacity: Math.min(1, p * 2),
                    boxShadow: "0 3px 6px rgb(0 0 0 / 0.18)",
                  }}
                >
                  Relisting ↻
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: (RELIST_BTN.x - 6) * k,
            top: 26 + (RELIST_BTN.y - 6) * k,
            width: (RELIST_BTN.w + 12) * k,
            height: (RELIST_BTN.h + 12) * k,
            borderRadius: 999,
            border: `4px solid ${C.accent}`,
            opacity: ring,
            scale: String(mix(1.2, 1, ring) * press),
          }}
        />
      </div>
      {/* The app's toast. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 900 + (1 - toast) * 160,
          translate: "-50% 0",
          opacity: Math.min(1, toast * 2),
          background: C.ink,
          color: "#fbf8ee",
          fontFamily: franklin,
          fontWeight: 600,
          fontSize: 34,
          letterSpacing: "-0.02em",
          padding: "18px 40px 20px",
          borderRadius: 999,
          boxShadow: printShadow(0.5),
        }}
      >
        Relisting 3 listings
      </div>
      <MonoLabel
        size={20}
        color={C.muted}
        style={{ position: "absolute", left: 0, right: 0, bottom: 40, textAlign: "center", textTransform: "none", letterSpacing: "0.02em", opacity: toast }}
      >
        Relisting works on eBay and Vinted · you choose when a listing counts as old
      </MonoLabel>
    </>
  );
};
