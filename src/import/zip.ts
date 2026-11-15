import zlib from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_EXTRA_FIELD = 0x0001;
const LARGEST_COMMENT = 0xffff;
const MASK_16 = 0xffff;
const MASK_32 = 0xffffffff;

const STORED = 0;
const DEFLATED = 8;
const ZSTANDARD = 93;

export class ZipError extends Error {}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const readUInt64 = (bytes: Buffer, offset: number) => Number(bytes.readBigUInt64LE(offset));

function endOfCentralDirectoryOffset(bytes: Buffer): number {
  const earliest = Math.max(0, bytes.length - 22 - LARGEST_COMMENT);

  for (let offset = bytes.length - 22; offset >= earliest; offset--)
    if (bytes.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;

  throw new ZipError("not a zip archive");
}

function centralDirectory(bytes: Buffer): { entryCount: number; offset: number } {
  const end = endOfCentralDirectoryOffset(bytes);
  const entryCount = bytes.readUInt16LE(end + 10);
  const offset = bytes.readUInt32LE(end + 16);

  if (entryCount !== MASK_16 && offset !== MASK_32) return { entryCount, offset };

  const locator = end - 20;

  if (locator < 0 || bytes.readUInt32LE(locator) !== ZIP64_END_LOCATOR) throw new ZipError("zip64 archive without its locator");

  const zip64End = readUInt64(bytes, locator + 8);

  if (bytes.readUInt32LE(zip64End) !== ZIP64_END_OF_CENTRAL_DIRECTORY) throw new ZipError("zip64 end of central directory not found");

  return { entryCount: readUInt64(bytes, zip64End + 32), offset: readUInt64(bytes, zip64End + 48) };
}

function entriesOf(bytes: Buffer): ZipEntry[] {
  const { entryCount, offset } = centralDirectory(bytes);
  const entries: ZipEntry[] = [];
  let cursor = offset;

  for (let index = 0; index < entryCount; index++) {
    if (bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY) throw new ZipError("damaged central directory");

    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    let uncompressedSize = bytes.readUInt32LE(cursor + 24);
    let compressedSize = bytes.readUInt32LE(cursor + 20);
    let localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    let extra = cursor + 46 + nameLength;
    const extraEnd = extra + extraLength;

    while (extra + 4 <= extraEnd) {
      const fieldId = bytes.readUInt16LE(extra);
      const fieldSize = bytes.readUInt16LE(extra + 2);

      if (fieldId === ZIP64_EXTRA_FIELD) {
        let value = extra + 4;

        if (uncompressedSize === MASK_32) [uncompressedSize, value] = [readUInt64(bytes, value), value + 8];

        if (compressedSize === MASK_32) [compressedSize, value] = [readUInt64(bytes, value), value + 8];

        if (localHeaderOffset === MASK_32) localHeaderOffset = readUInt64(bytes, value);
      }

      extra += 4 + fieldSize;
    }

    entries.push({ name, method: bytes.readUInt16LE(cursor + 10), compressedSize, localHeaderOffset });
    cursor = extraEnd + commentLength;
  }

  return entries;
}

function decompress(entry: ZipEntry, data: Buffer): Buffer {
  if (entry.method === STORED) return data;

  if (entry.method === DEFLATED) return zlib.inflateRawSync(data);

  if (entry.method === ZSTANDARD) {
    const zstdDecompressSync = (zlib as { zstdDecompressSync?: (data: Buffer) => Buffer }).zstdDecompressSync;

    if (!zstdDecompressSync) throw new ZipError(`zstd compression needs Node 22.15 or later (this is Node ${process.versions.node})`);

    return zstdDecompressSync(data);
  }

  throw new ZipError(`unsupported compression method ${entry.method} for ${entry.name}`);
}

/** The files of a zip archive, by name, read with Node's own zlib: stored, deflate and zstd entries. */
export function readZip(bytes: Buffer): Map<string, () => Buffer> {
  const files = new Map<string, () => Buffer>();

  for (const entry of entriesOf(bytes)) {
    files.set(entry.name, () => {
      const header = entry.localHeaderOffset;

      if (bytes.readUInt32LE(header) !== LOCAL_FILE_HEADER) throw new ZipError(`damaged local header for ${entry.name}`);

      const dataStart = header + 30 + bytes.readUInt16LE(header + 26) + bytes.readUInt16LE(header + 28);

      return decompress(entry, bytes.subarray(dataStart, dataStart + entry.compressedSize));
    });
  }

  return files;
}
