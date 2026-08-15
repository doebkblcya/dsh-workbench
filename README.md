# dsh-workbench — DSH Web GUI right-side workbench

**English** | [中文](./README.zh-CN.md)

A single-package plugin that adds a VS Code-style right-side workbench to the
DSH Web GUI: a **Preview** column plus a **single workbench panel** with
**Files / Git** icon tabs.

- **Workbench panel** (flush with the window edge): a Files/Git icon tab bar.
  - **Files**: a lazy file tree with filename search. Clicking a file opens it
    in the Preview column; clicking a folder row expands/collapses it.
  - **Git**: two collapsible VS Code-style sections.
    - **Changes (更改)**: branch bar (switch / create), commit box, and the
      changes list (staged / unstaged / untracked, each with a count header).
    - **Graph (图表)**: the inline Git graph (windowed rendering keeps large
      repos light).
    - Sections collapse with a smooth 200ms animation; while both are open a
      draggable divider resizes the split. Push/pull report success as a
      toast; failures show in a dismissible error bar.
- **Preview** (to the left of the workbench panel): multi-tab preview of
  markdown / html / code / diff / csv / pdf / office / images / text, with
  source↔preview toggle, split edit and save.

## What it does

| Capability | Status |
|---|---|
| File explorer + filename search | ✅ |
| Multi-format preview | ✅ |
| Changes list (stage / unstage / discard) with group counts | ✅ |
| Branch switch / create | ✅ |
| Inline Git graph (windowed) | ✅ |
| Commit | ✅ |
| Push / pull | ✅ (host-side auth; toast + dismissible errors) |
| Collapsible sections with animation + resize divider | ✅ |

## Architecture

- **Host half** (`src/host`, `src/index.ts`): workspace-gated filesystem +
  a *single unified* git service, exposed over `/workbench/*` (fs) and
  `/git/*` (git), plus one `/workbench/events` SSE stream.
- **Browser half** (`src/client`): a DOM layout controller that extends the
  shell's 3-column grid into 5 columns (Preview + workbench panel), two React
  roots, and framework-free stores (layout / explorer / scm / preview / git).
- The two upstream git services (dsh-aionui-panel's changes + dsh-git-graph's
  branches/graph/switch) are merged into one service with one gate, one repo
  cache, and one combined operation-marker probe (1 git spawn, not 7).

## Install

From source (local):

```sh
dsh plugin --profile web add link:<path-to-this-repo>
```

~~From npm (once published): `dsh plugin --profile web add @doebkblcya/dsh-workbench`~~

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
