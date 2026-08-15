# dsh-workbench — DSH Web GUI right-side workbench

A single-package plugin that adds a VS Code-style three-column right-side
workbench to the DSH Web GUI: **`[Preview][Git][Files]`**.

- **Files** (flush with the window edge): a lazy file tree with filename search.
  Clicking a file opens it in the preview panel; a full row expands a folder.
- **Preview** (innermost): multi-tab preview of markdown / html / code / diff /
  csv / pdf / office / images / text, with source↔preview toggle, split edit
  and save.
- **Git** (middle): split top/bottom. The top is a Source-Control-like pane —
  branch bar (switch / create branch), commit box, and the changes list
  (stage / unstage / discard). The bottom is an inline Git graph.

## What it does

| Capability | Status |
|---|---|
| File explorer + filename search | ✅ |
| Multi-format preview | ✅ |
| Changes list (stage / unstage / discard) | ✅ |
| Branch switch / create | ✅ |
| Inline Git graph | ✅ |
| Commit | ✅ (phase 1) |
| Push / pull | ✅ (phase 2, host-side auth) |

The branch selector that upstream placed in the conversation header chip has
been removed; branch switching lives in the Git column's top bar.

## Architecture

- **Host half** (`src/host`, `src/index.ts`): workspace-gated filesystem +
  a *single unified* git service, exposed over `/workbench/*` (fs) and
  `/git/*` (git), plus one `/workbench/events` SSE stream.
- **Browser half** (`src/client`): a DOM layout controller that extends the
  shell's 3-column grid into 6 columns, three React roots, and framework-free
  stores (layout / explorer / scm / preview / git).
- The two upstream git services (dsh-aionui-panel's changes + dsh-git-graph's
  branches/graph/switch) are merged into one service with one gate, one repo
  cache, and one combined operation-marker probe (1 git spawn, not 7).

## Install

```sh
dsh plugin --profile web add link:<path-to-this-repo>
```

## Build

```sh
npm install
npm run build   # tsc -b && tsdown → lib/index.js + lib/client.js
```

## License & attribution

BSD-3-Clause. This package is a derivative work of the dsh-web-ui monorepo
(https://github.com/zhu1090093659/dsh-web-ui) — specifically
`dsh-aionui-panel` and `dsh-git-graph` (both 0.1.15). The right-panel design
was itself re-implemented from AionUi (iOfficeAI/AionUi, Apache-2.0). See
[`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE) for full attribution.

> Note: upstream's `package.json` metadata says `Apache-2.0` while the shipped
> package `LICENSE` files are `BSD-3-Clause` (the repo root LICENSE is
> Apache-2.0). This fork follows the shipped package license (BSD-3-Clause);
> both are permissive and derivative development is compliant either way.
