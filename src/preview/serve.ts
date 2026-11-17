import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const RELOAD_PATH = "/__astrolabe/reload";
const RELOAD_SCRIPT = `<script>new EventSource("${RELOAD_PATH}").onmessage = () => location.reload();</script>`;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
};

export interface Preview {
  server: Server;
  /** Tells every open page to load again, after a build. */
  reload(): void;
}

/** Serves a built site and reloads the open pages when told to; nothing outside the folder is served. */
export function servePreview(folder: string): Preview {
  const listeners = new Set<ServerResponse>();
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);

    if (path === RELOAD_PATH) {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      response.write(": connected\n\n");
      listeners.add(response);
      request.on("close", () => listeners.delete(response));

      return;
    }

    const requested = normalize(join(folder, path));
    const file = existsSync(requested) && statSync(requested).isDirectory() ? join(requested, "index.html") : requested;

    if ((file !== folder && !file.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`)) || !existsSync(file)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");

      return;
    }

    const contentType = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
    const content = readFileSync(file);

    response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    response.end(extname(file) === ".html" ? content.toString("utf8").replace("</body>", `${RELOAD_SCRIPT}\n</body>`) : content);
  });

  return {
    server,
    reload: () => {
      for (const listener of listeners) listener.write("data: reload\n\n");
    },
  };
}
