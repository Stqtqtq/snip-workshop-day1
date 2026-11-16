# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener API.
Requires Node.js 20 or newer. The backend defaults to `http://localhost:3000`;
set `SNIP_API` to use another HTTP(S) API base URL.

```sh
./snip add https://example.com
./snip ls
./snip open abc123
```

You can also run `node cli.js <command>`. On Windows, use `snip.cmd` or
`snip.ps1`. `snip add` prints the new short URL; `snip ls` prints all links and
hit counts; `snip open` requests the short URL without following its redirect
and opens the redirect target in the system browser.

Run the CLI checks with `node --test`.
