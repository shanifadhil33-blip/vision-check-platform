# /lib/acuity

Pure TypeScript. Nothing lives here yet.

Per AGENTS.md rule 1, modules in this folder must not import from `react` or `next`, and must not touch `window`, `document` or `navigator`. They take numbers and return numbers so they can be unit tested without a browser. ESLint enforces this.

Per AGENTS.md rule 3, every variable carrying a physical quantity states its unit in its name: `Mm`, `Arcmin`, `CssPx`, `DevicePx`. Acuity is held as logMAR here and converted to a Snellen notation only at the display layer.
