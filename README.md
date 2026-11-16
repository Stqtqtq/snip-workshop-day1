# Snip

Snip is a URL shortener with one backend and two clients: an Angular web app and
a zero-dependency Node.js CLI. All three use the same API.

## API contract

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` | `201` `{ code, url, shortUrl, hits, createdAt }`; `400` for invalid JSON or a non-HTTP(S) URL |
| `GET` | `/api/links` | — | `200` array of link objects |
| `GET` | `/:code` | — | `302` redirect and incremented hit count; `404` for an unknown code |

Links are held in an in-memory map and are cleared when the backend restarts.

## Repository layout

Each component lives at the root of its own branch: `backend` (Bun server),
`frontend` (Angular 19 app), and `cli` (CommonJS Node CLI). The `main` branch is
the superproject; its folders are submodules pointing to exact commits of those
branches.

## Clone

Use `--recurse-submodules` to populate the component folders:

```sh
git clone --recurse-submodules https://github.com/Stqtqtq/snip-workshop-day1.git
```

Without that option, initialize the submodules afterward:

```sh
git submodule update --init --recursive
```

## Run locally

Start the backend (requires Bun 1.x):

```sh
cd backend
bun start
```

In another terminal, run the web app (requires Node.js 20+ and npm):

```sh
cd frontend
npm install
npx ng serve
```

In another terminal, use the CLI against the same backend:

```sh
cd cli
node cli.js ls
node cli.js add https://example.com
```

## Update components

Commit and push changes from inside a component submodule. Then, from the
superproject, advance and commit its pointer:

```sh
git submodule update --remote <path>
git add <path>
git commit -m "Update <path> submodule"
git push
```

The pointer commit records the exact component revision used by this checkout.
