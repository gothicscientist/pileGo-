import React from "react";
import { Img, staticFile } from "remotion";
import { shadowRGB } from "../theme";

/**
 * A real capture of the pileGo! app. Captures are 2x PNGs of a 1440x900
 * viewport (public/ui, see capture/). `crop` is in the app's own CSS pixels,
 * so coordinates can be read straight off the app.
 */
export const Screen: React.FC<{
  src: string;
  crop?: { x: number; y: number; w: number; h: number };
  /** Natural size of the capture in CSS px (half the PNG size). */
  natural?: { w: number; h: number };
  width: number;
  style?: React.CSSProperties;
  imgStyle?: React.CSSProperties;
  radius?: number;
}> = ({ src, crop, natural = { w: 1440, h: 900 }, width, style, imgStyle, radius = 0 }) => {
  const c = crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
  const k = width / c.w;
  return (
    <div style={{ position: "relative", width, height: c.h * k, overflow: "hidden", borderRadius: radius, ...style }}>
      <Img
        src={staticFile(`ui/${src}`)}
        style={{
          position: "absolute",
          left: -c.x * k,
          top: -c.y * k,
          width: natural.w * k,
          height: natural.h * k,
          maxWidth: "none",
          ...imgStyle,
        }}
      />
    </div>
  );
};

/** Paper-print presentation for a capture: a sheet with a real shadow. */
export const printShadow = (lift = 0.3) =>
  `0 1px 1px rgb(${shadowRGB} / 0.12), 0 ${6 + lift * 30}px ${14 + lift * 50}px -${4 + lift * 10}px rgb(${shadowRGB} / ${0.22 + lift * 0.12})`;
