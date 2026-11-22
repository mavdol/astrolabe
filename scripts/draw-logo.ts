// Draws the Astrolabe logo: one star placed on its circle, what an astrolabe is for, drawn with the rings of the
// site's prototype (a solid inner ring and a dotted outer one) around a centre dot. Writes the plugin's icon and the
// README's banner (the mark beside the name in Inter, transparent, one image per colour mode).
//
// usage: pnpm exec tsx scripts/draw-logo.ts
import { writeFileSync } from "node:fs";
import { pngOf } from "../src/render/png.js";
import { CAP_HEIGHT_RATIO, SvgTextRenderer } from "../src/render/svg-text.js";

/** In the mark's own units: the outer ring's radius is 200, and the star on it reaches 234 from the centre. */
const INNER_RING = 108;
const OUTER_RING = 200;
const OUTER_RING_DOTS = 40;
const CENTRE_RADIUS = 32;
const STAR_RADIUS = 34;
const STAR_DEGREES = -40;
const MARK_EXTENT = OUTER_RING + STAR_RADIUS;

/** The rings stay quieter than the star and the centre; heavier in the icon, which is seen down to 20 px. */
interface Rings {
  width: number;
  opacity: number;
}

const NAME = "Astrolabe";
const PAGE_BACKGROUND = "#0e0f11";
const INK = { dark: "#f1f2f4", light: "#111214" };
const ICON_RINGS: Rings = { width: 17, opacity: 0.5 };
/** Darker in light mode, where grey rings would make the mark lighter than the name. */
const BANNER_RINGS: Record<keyof typeof INK, Rings> = { dark: { width: 12, opacity: 0.42 }, light: { width: 12, opacity: 0.55 } };

const rounded = (value: number) => Math.round(value * 100) / 100;

function orbit(centreX: number, centreY: number, extent: number, ink: string, rings: Rings): string {
  const starAngle = (STAR_DEGREES * Math.PI) / 180;
  const starX = rounded(OUTER_RING * Math.cos(starAngle));
  const starY = rounded(OUTER_RING * Math.sin(starAngle));
  const dotSpacing = rounded((2 * Math.PI * OUTER_RING) / OUTER_RING_DOTS);

  return `<g transform="translate(${rounded(centreX)} ${rounded(centreY)}) scale(${rounded(extent / MARK_EXTENT)})" fill="${ink}">
<g fill="none" stroke="${ink}" stroke-opacity="${rings.opacity}" stroke-width="${rings.width}" stroke-linecap="round">
<circle r="${INNER_RING}"/><circle r="${OUTER_RING}" stroke-dasharray="0.01 ${dotSpacing}"/></g>
<circle r="${CENTRE_RADIUS}"/><circle cx="${starX}" cy="${starY}" r="${STAR_RADIUS}"/></g>`;
}

const svgOf = (width: number, height: number, content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;

/** A square for the plugin directory, which takes a PNG from 512 to 2048 px: the page's background, the mark inside the circle a host may crop to. */
function icon(size: number): string {
  return svgOf(
    size,
    size,
    `<rect width="${size}" height="${size}" fill="${PAGE_BACKGROUND}"/>${orbit(size / 2, size / 2, size * 0.37, INK.dark, ICON_RINGS)}`,
  );
}

/** The mark and the name on one line, the mark centred on the capitals and about twice their height, as the hero sets its title. */
function banner(mode: keyof typeof INK): string {
  const text = new SvgTextRenderer();
  const style = { weight: 500, size: 56, tracking: -0.035 } as const;
  const capHeight = style.size * CAP_HEIGHT_RATIO;
  const markExtent = capHeight * 1.1;
  const margin = 8;
  const height = Math.ceil(2 * (markExtent + margin));
  const nameX = margin + markExtent * 2.6;
  const width = Math.ceil(nameX + text.measure(NAME, style) + margin);
  const name = text.draw(NAME, nameX, height / 2 + capHeight / 2, { ...style, fill: INK[mode] });

  return svgOf(
    width,
    height,
    `${text.definitions()}${orbit(margin + markExtent, height / 2, markExtent, INK[mode], BANNER_RINGS[mode])}${name}`,
  );
}

writeFileSync("plugin/.claude-plugin/icon.png", pngOf(icon(1024), 1));

for (const mode of ["dark", "light"] as const) writeFileSync(`assets/readme/banner-${mode}.png`, pngOf(banner(mode), 3));
