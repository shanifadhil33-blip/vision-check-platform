# /lib/calibration

Pure TypeScript. Nothing lives here yet.

Per AGENTS.md rule 1, modules in this folder must not import from `react` or `next`, and must not touch `window`, `document` or `navigator`. They take numbers and return numbers so they can be unit tested without a browser. ESLint enforces this.

Device context that these functions need — `devicePixelRatio`, viewport size, screen size — is read at the call site and passed in as arguments. It is never read from a global here.

Per AGENTS.md rule 4, no CSS physical unit ever leaves this layer. The output is `pxPerMm` and pixel counts derived from it.
