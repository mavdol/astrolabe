import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, row after row. */
  pixels: Buffer;
}

const RGBA = 6;
const BYTES_PER_PIXEL = 4;

/** Decodes the 8-bit RGBA, non-interlaced PNG that the renderer writes; nothing else is needed by the tests. */
export function decodePng(file: Buffer): DecodedPng {
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed: Buffer[] = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);

      if (data[8] !== 8 || data[9] !== RGBA || data[12] !== 0) throw new Error("only 8-bit RGBA, non-interlaced PNG files are decoded");
    }

    if (type === "IDAT") compressed.push(data);

    offset += 12 + length;
  }

  const filtered = inflateSync(Buffer.concat(compressed));
  const rowLength = width * BYTES_PER_PIXEL;
  const pixels = Buffer.alloc(rowLength * height);

  for (let row = 0; row < height; row++) {
    const filter = filtered[row * (rowLength + 1)];
    const source = filtered.subarray(row * (rowLength + 1) + 1, (row + 1) * (rowLength + 1));
    const start = row * rowLength;

    for (let column = 0; column < rowLength; column++) {
      const left = column >= BYTES_PER_PIXEL ? pixels[start + column - BYTES_PER_PIXEL] : 0;
      const up = row > 0 ? pixels[start - rowLength + column] : 0;
      const upLeft = row > 0 && column >= BYTES_PER_PIXEL ? pixels[start - rowLength + column - BYTES_PER_PIXEL] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];

      pixels[start + column] = (source[column] + predictor) & 0xff;
    }
  }

  return { width, height, pixels };
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);

  if (toLeft <= toUp && toLeft <= toUpLeft) return left;

  return toUp <= toUpLeft ? up : upLeft;
}

/** Share of pixels whose channels differ by more than the tolerance: edges may be smoothed slightly differently from one machine to another. */
export function shareOfDifferentPixels(first: DecodedPng, second: DecodedPng, tolerance = 16): number {
  if (first.width !== second.width || first.height !== second.height) return 1;

  let different = 0;

  for (let index = 0; index < first.pixels.length; index += BYTES_PER_PIXEL) {
    for (let channel = 0; channel < BYTES_PER_PIXEL; channel++) {
      if (Math.abs(first.pixels[index + channel] - second.pixels[index + channel]) > tolerance) {
        different++;
        break;
      }
    }
  }

  return different / (first.width * first.height);
}
