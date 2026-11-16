# Snip backend

A zero-dependency Bun URL shortener. Links are held in memory and are cleared when the server restarts.

Run with `bun start` (port 3000 by default). Set `PORT` to change the port, `BASE_URL` to set the short-link origin, or `RAILWAY_PUBLIC_DOMAIN` to use a Railway public domain. If `PUBLIC_DIR` is set, the server also serves static files from that directory.

The API creates links with `POST /api/links` (`{ "url": "https://example.com" }`), lists them with `GET /api/links`, and redirects through `GET /:code`.
