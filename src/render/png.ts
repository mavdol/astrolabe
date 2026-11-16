import { Resvg } from "@resvg/resvg-js";

/** Twice the card's size, so that it stays sharp on high-density screens. */
export const PNG_SCALE = 2;

/**
 * The PNG of a card, for readers that cannot show an SVG from a repository,
 * such as the GitHub mobile app. System fonts are not loaded: the card's text
 * is already drawn as paths, and scanning the fonts would take seconds.
 */
export function pngOf(svg: string): Buffer {
  return new Resvg(svg, { fitTo: { mode: "zoom", value: PNG_SCALE }, font: { loadSystemFonts: false } }).render().asPng();
}
