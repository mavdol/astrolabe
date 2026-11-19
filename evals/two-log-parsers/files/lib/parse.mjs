// Every script reads log lines through this module. LOGLINE=fast loads logline-fast instead of logline.
const library = process.env.LOGLINE === "fast" ? await import("../vendor/logline-fast/index.js") : await import("../vendor/logline/index.js");

export const { parseLine } = library;

export function linesOf(text) {
  return text.split("\n").filter((line) => line !== "");
}
