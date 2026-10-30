import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Paper } from "../components/Paper";
import { MonoLabel, PriceTag } from "../components/Props";
import { printShadow, Screen } from "../components/Screen";
import { headlineItalic, MaskWords } from "../components/Type";
import { COVER, CROP, inPrint, PRINT, PRINT_K, STACK } from "../layout";
import { ease, keys, mix, sp, tween } from "../lib/anim";
import { C, franklin } from "../theme";

/**
 * 6.2–11.2s. Snap. Scan. Done. pileGo!'s real scan page: three photos in,
 * "Scan with AI", the real progress checklist, then "Check it over" with
 * every field the AI filled, scrolled like the real page.
 */

export { SCAN_LEN } from "../layout";
const PRESS = 16; // "Scan with AI"
const LOAD = [18, 34, 48]; // the three real progress states
const DONE = 64; // "Check it over"
const PUSH = 76; // camera moves in on the form
const SAVE = 136; // "Save and cross-list"

// App CSS px.
const BUTTON = { x: 750, y: 320, w: 168, h: 42 };
const CARD = { x: 728, y: 193, w: 664, h: 707 }; // the review form card
const FORM = { x: 752, y: 218, w: 616, h: 1883 }; // scan-review-form.png
const SAVEBAR = { x: 728, y: 816, w: 664, h: 68 };
const SCROLL = 640;
const S_PUSH = 1.35;

export const S2Scan: React.FC = () => {
  const frame = useCurrentFrame();

  const state = frame < LOAD[0] ? 0 : frame < LOAD[1] ? 1 : frame < LOAD[2] ? 2 : frame < DONE ? 3 : 4;
  const press = keys(frame, [PRESS - 2, PRESS, PRESS + 5], [1, 0.94, 1], ease.out);
  const ring = tween(frame, [2, 12], [0, 1], ease.out) * (1 - tween(frame, [PRESS + 2, PRESS + 8], [0, 1]));
  const reviewIn = tween(frame, [DONE, DONE + 8], [0, 1], ease.out);

  // Camera on the print. A slow drift toward the checklist while the AI works,
  // then one push in on the form so the filled fields can be read.
  const push = sp(frame, PUSH, { damping: 200, stiffness: 60, mass: 1 });
  const s = mix(keys(frame, [LOAD[0], DONE], [1, 1.035], ease.inOut), S_PUSH, push);
  // Pin the form card's left edge at x=700 and the bottom of the page to the
  // bottom of the frame, so the whole card and its save bar are in shot.
  const pin = inPrint(CARD);
  const tx = mix(keys(frame, [LOAD[0], DONE], [0, -20], ease.inOut), 700 - PRINT.x - pin.x * S_PUSH, push);
  const ty = mix(0, 1062 - PRINT.y - (890 - CROP.y) * PRINT_K * S_PUSH, push);
  const scroll = tween(frame, [PUSH + 14, SAVE - 6], [0, SCROLL], ease.inOut);

  const savePress = keys(frame, [SAVE - 1, SAVE + 1, SAVE + 6], [1, 0.95, 1], ease.out);
  const stackCompact = tween(frame, [PUSH - 2, PUSH + 16], [0, 1], ease.inOut);

  const btn = inPrint(BUTTON);
  const card = inPrint(CARD);
  const form = inPrint(FORM);
  const bar = inPrint(SAVEBAR);

  return (
    <AbsoluteFill>
      <Paper />

      {/* The app, as a print on the table. */}
      <div
        style={{
          position: "absolute",
          left: PRINT.x,
          top: PRINT.y,
          translate: `${tx}px ${ty}px`,
          scale: String(s),
          transformOrigin: "0 0",
        }}
      >
        <div style={{ position: "relative", boxShadow: printShadow(0.25), borderRadius: 12, overflow: "hidden", background: C.paper }}>
          <Screen src="scan-photos.png" crop={CROP} width={PRINT.w} />
          {state >= 1 && state <= 3 && (
            <Screen src={`scan-loading-${state}.png`} crop={CROP} width={PRINT.w} style={{ position: "absolute", left: 0, top: 0 }} />
          )}
          {state >= 1 && state <= 3 && <Beam frame={frame - LOAD[0]} />}
          {reviewIn > 0 && (
            <Screen src="scan-review-1.png" crop={CROP} width={PRINT.w} style={{ position: "absolute", left: 0, top: 0, opacity: reviewIn }} />
          )}
          {/* The form card scrolls like the real page, under its sticky save bar. */}
          {frame >= PUSH && (
            <>
              <div style={{ position: "absolute", left: card.x, top: card.y, width: card.w, height: card.h, overflow: "hidden", background: C.card, borderRadius: 24 * PRINT_K }}>
                <Screen
                  src="scan-review-form.png"
                  natural={{ w: FORM.w, h: FORM.h }}
                  width={form.w}
                  style={{ position: "absolute", left: form.x - card.x, top: form.y - card.y - scroll * PRINT_K }}
                />
              </div>
              <Screen
                src="scan-review-savebar.png"
                natural={{ w: SAVEBAR.w, h: SAVEBAR.h }}
                width={bar.w}
                style={{ position: "absolute", left: bar.x, top: bar.y, scale: String(savePress), transformOrigin: "25% 50%" }}
              />
            </>
          )}
          {/* "Scan with AI": a ring finds the button, then it's pressed. */}
          {frame < LOAD[0] + 2 && (
            <div
              style={{
                position: "absolute",
                left: btn.x - 8,
                top: btn.y - 8,
                width: btn.w + 16,
                height: btn.h + 16,
                borderRadius: 16,
                border: `4px solid ${C.accent}`,
                opacity: ring,
                scale: String(mix(1.25, 1, ring) * press),
              }}
            />
          )}
          {/* And the same for Save and cross-list. */}
          {frame >= SAVE - 14 && (
            <div
              style={{
                position: "absolute",
                left: bar.x + 10,
                top: bar.y + 3,
                width: 196 * PRINT_K,
                height: 62 * PRINT_K,
                borderRadius: 16,
                border: `4px solid ${C.accent}`,
                opacity: tween(frame, [SAVE - 14, SAVE - 6], [0, 1]) * (1 - tween(frame, [SAVE + 4, SAVE + 10], [0, 1])),
                scale: String(mix(1.2, 1, tween(frame, [SAVE - 14, SAVE - 4], [0, 1], ease.out)) * savePress),
              }}
            />
          )}
        </div>
      </div>

      {/* Once pushed in, the left of the frame goes back to paper for the type. */}
      <AbsoluteFill
        style={{
          opacity: push,
          background: `linear-gradient(90deg, ${C.paper} 0%, ${C.paper} 31%, ${C.paper}00 36%)`,
        }}
      />
      {frame >= PUSH && <Callouts frame={frame} scroll={scroll} s={s} tx={tx} ty={ty} />}

      {/* The kinetic stack, which tucks itself into a byline once the form needs the room. */}
      <div
        style={{
          position: "absolute",
          left: STACK.x,
          top: STACK.y,
          scale: String(mix(1, 0.4, stackCompact)),
          translate: `0 ${mix(0, -170, stackCompact)}px`,
          transformOrigin: "0 0",
        }}
      >
        <StackWord text="Snap." at={-100} active={frame < PRESS || stackCompact > 0.5} />
        <div style={{ height: STACK.step - STACK.size }} />
        <StackWord text="Scan." at={PRESS - 2} active={(frame >= PRESS && frame < DONE) || stackCompact > 0.5} />
        <div style={{ height: STACK.step - STACK.size }} />
        <StackWord text="Done." at={DONE} active={frame >= DONE} />
      </div>
      <MonoLabel
        size={22}
        style={{
          position: "absolute",
          left: STACK.x + 4,
          top: 300,
          opacity: tween(frame, [PUSH + 10, PUSH + 20], [0, 1]),
          lineHeight: 1.55,
        }}
      >
        3 photos in.
        <br />A full listing out.
      </MonoLabel>
    </AbsoluteFill>
  );
};

const StackWord: React.FC<{ text: string; at: number; active: boolean }> = ({ text, at, active }) => (
  <div style={{ opacity: active ? 1 : 0.26 }}>
    <MaskWords words={[text]} at={at} size={STACK.size} wordStyle={headlineItalic} />
  </div>
);

/** The app's scan beam (a green band sweeping the cover photo), redrawn so it moves. */
const Beam: React.FC<{ frame: number }> = ({ frame }) => {
  const c = inPrint(COVER);
  const period = 26;
  const t = (frame % period) / period;
  const band = c.h * 0.36;
  const y = mix(-band, c.h, ease.inOut(t));
  return (
    <div style={{ position: "absolute", left: c.x, top: c.y, width: c.w, height: c.h, overflow: "hidden", borderRadius: 20 * PRINT_K }}>
      {/* A clean copy of the photo, so the beam baked into the capture doesn't double up. */}
      <Screen src="scan-photos.png" crop={COVER} width={c.w} style={{ position: "absolute", left: 0, top: 0 }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: y,
          width: "100%",
          height: band,
          background: "linear-gradient(180deg, rgb(86 112 63 / 0) 0%, rgb(86 112 63 / 0.55) 100%)",
          borderBottom: "3px solid rgb(168 198 138 / 0.9)",
        }}
      />
    </div>
  );
};

/**
 * Kraft labels naming what the AI filled. Each rides with its field as the
 * form scrolls, and only shows while that field is on screen.
 */
const Callouts: React.FC<{ frame: number; scroll: number; s: number; tx: number; ty: number }> = ({ frame, scroll, s, tx, ty }) => {
  const form = inPrint(FORM);
  const card = inPrint(CARD);
  // y: the field's position inside the form capture (app CSS px).
  const items = [
    { label: "Title, size, era", y: 46 },
    { label: "Condition", y: 420 },
    { label: "Flaws, said plainly", y: 550 },
    { label: "Colours & fabric", y: 640 },
    { label: "Measurements", y: 1000 },
    { label: "Description", y: 1170 },
  ];
  const screenY = (y: number) => PRINT.y + ty + s * (form.y + (y - scroll) * PRINT_K);
  const left = PRINT.x + tx + s * card.x;
  const top = PRINT.y + ty + s * card.y;
  const bottom = PRINT.y + ty + s * (card.y + card.h - 80 * PRINT_K);
  return (
    <>
      {items.map((it) => {
        const y = screenY(it.y);
        const vis = tween(y, [top - 10, top + 60], [0, 1]) * tween(y, [bottom - 80, bottom], [1, 0]);
        if (vis <= 0.001) return null;
        return (
          <div
            key={it.label}
            style={{
              position: "absolute",
              right: 1920 - left + 18,
              top: y - 26,
              opacity: vis,
              translate: `${(1 - vis) * 30}px 0`,
              fontFamily: franklin,
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: "-0.02em",
              color: C.kraftInk,
              background: C.kraft,
              padding: "9px 30px 10px 18px",
              clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 3px rgb(0 0 0 / 0.12)",
            }}
          >
            {it.label}
          </div>
        );
      })}
      <PriceTag
        price="$30"
        note="suggested"
        width={140}
        swing={keys(frame, [SAVE - 30, SAVE - 22, SAVE - 12, SAVE], [-34, 10, -5, 2], ease.inOut)}
        style={{ left: 1730, top: 150, opacity: tween(frame, [SAVE - 30, SAVE - 24], [0, 1]) }}
      />
    </>
  );
};
