import { createHash } from "node:crypto";

const TWO_TO_32 = 4294967296;
const LARGEST_EXACT_BOUND = 2097151;

const rotateLeft = (word: number, bits: number) => (word << bits) | (word >>> (32 - bits));

/**
 * xoshiro128** (Blackman & Vigna). The 32-bit member of the family is used
 * because every operation is exact in JavaScript with Math.imul and >>>, so a
 * port to another language gives the same stream.
 */
export class Xoshiro128 {
  private word0: number;
  private word1: number;
  private word2: number;
  private word3: number;

  constructor(state: [number, number, number, number]) {
    [this.word0, this.word1, this.word2, this.word3] = state.map((word) => word >>> 0) as [number, number, number, number];
    const stateIsAllZero = (this.word0 | this.word1 | this.word2 | this.word3) === 0;

    if (stateIsAllZero) this.word0 = 1;
  }

  /** Next unsigned 32-bit integer. */
  next(): number {
    const output = Math.imul(rotateLeft(Math.imul(this.word1, 5), 7), 9) >>> 0;
    const shifted = this.word1 << 9;

    this.word2 ^= this.word0;
    this.word3 ^= this.word1;
    this.word1 ^= this.word2;
    this.word0 ^= this.word3;
    this.word2 ^= shifted;
    this.word3 = rotateLeft(this.word3, 11);

    return output;
  }

  /**
   * Unbiased integer in [0, bound), by Lemire's method on 32-bit outputs. The
   * bound stays below 2^21 so that output × bound is exact in a double.
   */
  below(bound: number): number {
    if (!(bound > 0 && bound <= LARGEST_EXACT_BOUND))
      throw new Error(`below(bound): bound must be in 1..${LARGEST_EXACT_BOUND}, got ${bound}`);

    let product = this.next() * bound;
    let lowHalf = product % TWO_TO_32;

    if (lowHalf < bound) {
      const rejectionThreshold = (TWO_TO_32 - bound) % bound;

      while (lowHalf < rejectionThreshold) {
        product = this.next() * bound;
        lowHalf = product % TWO_TO_32;
      }
    }

    return Math.floor(product / TWO_TO_32);
  }
}

/**
 * The seed of a file: sha256 of "<raw id>:<sha256 of the raw file>\n" for
 * every raw file, ids in code-unit order, as 64 hexadecimal characters.
 */
export function deriveSeed(sha256OfRawFiles: Record<string, string>): string {
  const hash = createHash("sha256");

  for (const rawFileId of Object.keys(sha256OfRawFiles).sort()) hash.update(`${rawFileId}:${sha256OfRawFiles[rawFileId]}\n`, "utf8");

  return hash.digest("hex");
}

/**
 * One generator per computed interval, so that no result depends on the order
 * of computation. Its state is the first 16 bytes of
 * sha256(utf8("<seed>|<purpose>|<metric>|<node, or empty>|<candidate>")),
 * read as four little-endian 32-bit words.
 */
export function generatorFor(
  seed: string,
  purpose: "value" | "comparison",
  metric: string,
  node: string | undefined,
  candidate: string,
): Xoshiro128 {
  const digest = createHash("sha256")
    .update(`${seed}|${purpose}|${metric}|${node ?? ""}|${candidate}`, "utf8")
    .digest();

  return new Xoshiro128([digest.readUInt32LE(0), digest.readUInt32LE(4), digest.readUInt32LE(8), digest.readUInt32LE(12)]);
}
