// Shared geometry, so one scene can hand an object to the next on the exact
// same pixels and the cut between them is invisible.

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The app capture in the scan scene. CROP is the part of the 1440x900 app
 * viewport we show (the sidebar is left out), PRINT is where it lands.
 */
export const CROP: Rect = { x: 264, y: 0, w: 1152, h: 868 };
export const PRINT = { x: 584, y: 44, w: 1290 };
export const PRINT_K = PRINT.w / CROP.w;
export const PRINT_H = CROP.h * PRINT_K;

/** Maps a rectangle in the app's CSS px onto the frame (camera at rest). */
export const onPrint = (r: Rect): Rect => ({
  x: PRINT.x + (r.x - CROP.x) * PRINT_K,
  y: PRINT.y + (r.y - CROP.y) * PRINT_K,
  w: r.w * PRINT_K,
  h: r.h * PRINT_K,
});

/** The same, relative to the print's own top-left corner. */
export const inPrint = (r: Rect): Rect => ({
  x: (r.x - CROP.x) * PRINT_K,
  y: (r.y - CROP.y) * PRINT_K,
  w: r.w * PRINT_K,
  h: r.h * PRINT_K,
});

/** The cover photo card on /scan, in app CSS px. */
export const COVER: Rect = { x: 288, y: 217, w: 416, h: 520 };

/** The "Snap. Scan. Done." stack on the left. */
export const STACK = { x: 96, y: 250, size: 150, step: 158 };

/**
 * The timeline, in global frames. A sheet torn off the pad overlaps the
 * scene before it by TEAR frames.
 */
export const FILM_LEN = 840;
export const TEAR = 16;
export const SCAN_START = 186;
export const SCAN_LEN = 150;
export const CROSS_START = SCAN_START + SCAN_LEN; // 336
export const CROSS_LEN = 176;
export const CLOSET_START = CROSS_START + CROSS_LEN - TEAR; // 496
export const CLOSET_LEN = 160;
export const FINALE_LEN = 200;
export const FINALE_START = FILM_LEN - FINALE_LEN; // 640
