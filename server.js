const { randomBytes } = require("node:crypto");
const { resolve, sep } = require("node:path");

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const port = Number(process.env.PORT || 3000);
const baseUrl = (
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`)
).replace(/\/+$/, "");
const publicDir = process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : null;

function headers(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: headers({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

function newCode() {
  let code = "";
  while (code.length < 6) {
    for (const byte of randomBytes(8)) {
      if (byte >= 248) continue;
      code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

async function servePublicFile(pathname) {
  if (!publicDir) return null;

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", {
      status: 400,
      headers: headers({ "Content-Type": "text/plain; charset=utf-8" }),
    });
  }

  const filePath = resolve(publicDir, `.${relativePath === "/" ? "/index.html" : relativePath}`);
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) return null;

  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  return new Response(file, {
    headers: headers({ "Content-Type": file.type || "application/octet-stream" }),
  });
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headers() });
    }

    if (request.method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      const originalUrl = typeof body?.url === "string" ? body.url.trim() : "";
      let parsedUrl;
      try {
        parsedUrl = new URL(originalUrl);
      } catch {
        return jsonResponse({ error: "Invalid URL" }, 400);
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return jsonResponse({ error: "Invalid URL" }, 400);
      }

      let code;
      do {
        code = newCode();
      } while (links.has(code));

      const link = {
        code,
        url: originalUrl,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return jsonResponse(link, 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return jsonResponse(Array.from(links.values()));
    }

    if (request.method === "GET") {
      const staticResponse = await servePublicFile(pathname);
      if (staticResponse) return staticResponse;

      const code = pathname.slice(1);
      const link = !code.includes("/") ? links.get(code) : null;
      if (!link) return jsonResponse({ error: "Not found" }, 404);

      link.hits += 1;
      return new Response(null, {
        status: 302,
        headers: headers({ Location: link.url }),
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
});

console.log(`Snip backend listening on http://localhost:${port}`);
