// Draws the Astrolabe logo from the starburst of the site's prototype: rays of uneven length in grey, each ending in a
// bright dot. The README's banner keeps the prototype's starburst beside the name in Inter (transparent, one image per
// colour mode); the plugin's icon, seen much smaller, keeps 24 heavier rays drawn from a gap around the centre.
//
// usage: pnpm exec tsx scripts/draw-logo.ts
import { writeFileSync } from "node:fs";
import { pngOf } from "../src/render/png.js";
import { CAP_HEIGHT_RATIO, SvgTextRenderer } from "../src/render/svg-text.js";

/** A starburst in its own units: the longest ray is about 240 long, as in the prototype's 500-unit drawing. */
interface Starburst {
  rays: number;
  /** Where the rays start: 0 from the centre, more for a gap around the centre dot. */
  rayStart: number;
  /** The first ray's direction, clockwise from pointing right. */
  firstRayDegrees: number;
  lineWidth: number;
  dotRadius: number;
  centreRadius: number;
  /** Dashed circles behind the rays, in the faint colour of the page's strong rules. */
  rings: number[];
}

/** The prototype's, with lines four times as thick: drawn at about 85 px, its own would be a tenth of a pixel. */
const BANNER_STARBURST: Starburst = {
  rays: 64,
  rayStart: 0,
  firstRayDegrees: 0,
  lineWidth: 2.4,
  dotRadius: 3.2,
  centreRadius: 6,
  rings: [60, 120, 200],
};
/**
 * 64 lines meeting at the centre fill in below about 96 px, hence fewer, heavier rays and a gap around the centre. Turned a
 * quarter step past upright, so that no long ray stands on an axis like a stem.
 */
const ICON_STARBURST: Starburst = {
  rays: 24,
  rayStart: 52,
  firstRayDegrees: -90 + 360 / 24 / 4,
  lineWidth: 5.5,
  dotRadius: 11,
  centreRadius: 17,
  rings: [],
};
const LONGEST_RAY = 240;
const RAY_OPACITY = 0.55;

const NAME = "Astrolabe";
const PAGE_BACKGROUND = "#0e0f11";
const COLOURS = {
  dark: { ink: "#f1f2f4", ruleStrong: "rgba(255, 255, 255, 0.14)" },
  light: { ink: "#111214", ruleStrong: "rgba(0, 0, 0, 0.16)" },
};

const rounded = (value: number) => Math.round(value * 100) / 100;

/** The prototype's lengths: a slow wave, every other ray shortened, so the outline reads as measured values. */
const rayLength = (index: number) => 150 + 90 * Math.abs(Math.sin(index * 1.7)) * (index % 2 ? 0.55 : 1);

/**
 * The starburst with its outline, not its centre dot, centred on (centreX, centreY): the rays' uneven lengths would
 * otherwise make it look off-centre.
 */
function starburst(
  burst: Starburst,
  centreX: number,
  centreY: number,
  radius: number,
  colours: { ink: string; ruleStrong: string },
): string {
  const rays = Array.from({ length: burst.rays }, (_, index) => {
    const angle = ((burst.firstRayDegrees + (index * 360) / burst.rays) * Math.PI) / 180;

    return { cos: Math.cos(angle), sin: Math.sin(angle), length: rayLength(index) };
  });
  const middleOf = (values: number[]) => (Math.max(...values) + Math.min(...values)) / 2;
  const outlineCentreX = middleOf(rays.map((ray) => ray.cos * ray.length));
  const outlineCentreY = middleOf(rays.map((ray) => ray.sin * ray.length));
  const transform = `translate(${rounded(centreX)} ${rounded(centreY)}) scale(${rounded(radius / LONGEST_RAY)}) translate(${rounded(-outlineCentreX)} ${rounded(-outlineCentreY)})`;

  const rings = burst.rings.map(
    (ringRadius) =>
      `<circle r="${ringRadius}" fill="none" stroke="${colours.ruleStrong}" stroke-width="${burst.lineWidth}" stroke-dasharray="${rounded(burst.lineWidth * 2)} ${rounded(burst.lineWidth * 5)}"/>`,
  );
  const lines = rays.map(
    (ray) =>
      `<path d="M${rounded(ray.cos * burst.rayStart)} ${rounded(ray.sin * burst.rayStart)}L${rounded(ray.cos * ray.length)} ${rounded(ray.sin * ray.length)}"/>`,
  );
  const dots = rays.map(
    (ray) => `<circle cx="${rounded(ray.cos * ray.length)}" cy="${rounded(ray.sin * ray.length)}" r="${burst.dotRadius}"/>`,
  );

  return `<g transform="${transform}">${rings.join("")}<g stroke="${colours.ink}" stroke-opacity="${RAY_OPACITY}" stroke-width="${burst.lineWidth}" stroke-linecap="round">${lines.join("")}</g><g fill="${colours.ink}">${dots.join("")}<circle r="${burst.centreRadius}"/></g></g>`;
}

const svgOf = (width: number, height: number, content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;

/** A square for the plugin directory, which takes a PNG from 512 to 2048 px: the page's background, the mark inside the circle a host may crop to. */
function icon(size: number): string {
  return svgOf(
    size,
    size,
    `<rect width="${size}" height="${size}" fill="${PAGE_BACKGROUND}"/>${starburst(ICON_STARBURST, size / 2, size / 2, size * 0.4, COLOURS.dark)}`,
  );
}

/** The mark and the name on one line, the mark centred on the capitals and about twice their height, as the hero sets its title. */
function banner(colours: { ink: string; ruleStrong: string }): string {
  const text = new SvgTextRenderer();
  const style = { weight: 500, size: 56, tracking: -0.035 } as const;
  const capHeight = style.size * CAP_HEIGHT_RATIO;
  const markRadius = capHeight * 1.1;
  const margin = 8;
  const height = Math.ceil(2 * (markRadius + margin));
  const nameX = margin + markRadius * 2.6;
  const width = Math.ceil(nameX + text.measure(NAME, style) + margin);
  const name = text.draw(NAME, nameX, height / 2 + capHeight / 2, { ...style, fill: colours.ink });

  return svgOf(
    width,
    height,
    `${text.definitions()}${starburst(BANNER_STARBURST, margin + markRadius, height / 2, markRadius, colours)}${name}`,
  );
}

writeFileSync("plugin/.claude-plugin/icon.png", pngOf(icon(1024), 1));

for (const mode of ["dark", "light"] as const) writeFileSync(`assets/readme/banner-${mode}.png`, pngOf(banner(COLOURS[mode]), 3));
