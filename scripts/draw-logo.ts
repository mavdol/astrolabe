// Draws the Astrolabe logo from the starburst of the site's prototype: rays of uneven length, each ending in a dot,
// drawn from a small circle around the centre like the site's lollipops from zero. Writes the plugin's icon and the
// README's banner (the mark beside the name in Inter, transparent, one image per colour mode).
//
// usage: pnpm exec tsx scripts/draw-logo.ts
import { writeFileSync } from "node:fs";
import { pngOf } from "../src/render/png.js";
import { CAP_HEIGHT_RATIO, SvgTextRenderer } from "../src/render/svg-text.js";

const RAYS = 24;
const LONGEST_RAY = 240;
const GAP_AROUND_CENTRE = 52;
const NAME = "Astrolabe";
const PAGE_BACKGROUND = "#0e0f11";
const INK = { dark: "#f1f2f4", light: "#111214" };

const rounded = (value: number) => Math.round(value * 100) / 100;

/** The prototype's lengths: a slow wave, every other ray shortened, so the outline reads as measured values. */
const rayLength = (index: number) => 150 + 90 * Math.abs(Math.sin(index * 1.7)) * (index % 2 ? 0.55 : 1);

function starburst(centreX: number, centreY: number, radius: number, strokeWidth: number, ink: string): string {
  const scale = radius / LONGEST_RAY;
  const pointAt = (angle: number, distance: number) => [
    rounded(centreX + Math.cos(angle) * distance * scale),
    rounded(centreY + Math.sin(angle) * distance * scale),
  ];
  const rays = Array.from({ length: RAYS }, (_, index) => {
    const angle = (index / RAYS) * Math.PI * 2 - Math.PI / 2;
    const [startX, startY] = pointAt(angle, GAP_AROUND_CENTRE);
    const [endX, endY] = pointAt(angle, rayLength(index));

    return `<path d="M${startX} ${startY}L${endX} ${endY}"/><circle cx="${endX}" cy="${endY}" r="${rounded(strokeWidth * 1.6)}" stroke="none"/>`;
  });

  return `<g fill="${ink}" stroke="${ink}" stroke-width="${rounded(strokeWidth)}" stroke-linecap="round">${rays.join("")}<circle cx="${centreX}" cy="${centreY}" r="${rounded(strokeWidth * 2.6)}" stroke="none"/></g>`;
}

const svgOf = (width: number, height: number, content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;

/** A square for the plugin directory, which takes a PNG from 512 to 2048 px: the page's background, the mark inside the circle a host may crop to. */
function icon(size: number): string {
  return svgOf(
    size,
    size,
    `<rect width="${size}" height="${size}" fill="${PAGE_BACKGROUND}"/>${starburst(size / 2, size / 2, size * 0.38, size * 0.013, INK.dark)}`,
  );
}

/** The mark and the name on one line, the mark centred on the capitals and about twice their height, as the hero sets its title. */
function banner(ink: string): string {
  const text = new SvgTextRenderer();
  const style = { weight: 500, size: 56, tracking: -0.035 } as const;
  const capHeight = style.size * CAP_HEIGHT_RATIO;
  const markRadius = capHeight * 1.05;
  const margin = 8;
  const height = Math.ceil(2 * (markRadius + margin));
  const nameX = margin + markRadius * 2.62;
  const width = Math.ceil(nameX + text.measure(NAME, style) + margin);
  const name = text.draw(NAME, nameX, height / 2 + capHeight / 2, { ...style, fill: ink });

  return svgOf(width, height, `${text.definitions()}${starburst(margin + markRadius, height / 2, markRadius, 1.5, ink)}${name}`);
}

writeFileSync("plugin/.claude-plugin/icon.png", pngOf(icon(1024), 1));

for (const mode of ["dark", "light"] as const) writeFileSync(`assets/readme/banner-${mode}.png`, pngOf(banner(INK[mode]), 3));
