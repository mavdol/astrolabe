import { Resvg } from "@resvg/resvg-js";

/** Twice the card's size, so that it stays sharp on high-density screens. */
export const PNG_SCALE = 2;

/**
 * The PNG of a standalone SVG, for readers that cannot show an SVG: the GitHub mobile app, social
 * networks. System fonts are not loaded: the text is already drawn as paths, and scanning the fonts would take seconds.
 */
export function pngOf(svg: string, scale: number = PNG_SCALE): Buffer {
  return new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, font: { loadSystemFonts: false } }).render().asPng();
}
