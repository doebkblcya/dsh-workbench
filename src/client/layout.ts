/**
 * The DOM layout controller: extends the web shell's three-column frame
 * (`[data-dsh-frame]`, a grid) with two trailing grid tracks — the preview
 * region and the workbench panel (a single column hosting the Files/Git tabs)
 * — by mirroring the shell's own inline grid-template-columns string and
 * re-appending the two panel tracks on every shell update (MutationObserver,
 * same frame before paint). Column order left→right is [Preview][Workbench]
 * (the workbench panel is flush with the window edge). Also owns the absolute
 * drag handles and the floating expand button.
 *
 * The shell's inline style is the source of truth for the sidebar and details
 * tracks; this controller never guesses their widths.
 * @module dsh-workbench/client/layout
 */

import { handlePointerDragStart } from './drag.ts'
import {
  DEFAULT_PREVIEW_REGION_PX, DEFAULT_WORKSPACE_PANEL_PX,
  MAX_PREVIEW_REGION_PX, MAX_WORKSPACE_PANEL_PX,
  MIN_PREVIEW_PANEL_PX, MIN_WORKSPACE_PANEL_PX,
  KEY_EXPLORER_WIDTH, KEY_PREVIEW_WIDTH,
} from './store.ts'
import { writeStoredNumber } from './persist.ts'
import type { LayoutStore } from './store.ts'

/** The frame grid element (portals target it). */
let frameElement: HTMLElement | null = null

/** Read the current frame element (undefined while the shell is not mounted). */
export function getFrameElement(): HTMLElement | null {
  return frameElement
}

/** Locate the frame grid element the panel columns append into. */
function findFrame(): HTMLElement | null {
  const stamped = document.querySelector<HTMLElement>('[data-dsh-frame]')
  if (stamped !== null) return stamped
  return document.querySelector<HTMLElement>('[class*="sidebarCol"]')?.parentElement ?? null
}

/** Parse an inline grid-template-columns string into its tracks. */
export function parseGridTracks(input: string): string[] {
  const tracks: string[] = []
  let depth = 0
  let current = ''
  for (const char of input) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ' ' && depth === 0) {
      if (current !== '') {
        tracks.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current !== '') tracks.push(current)
  return tracks
}

/** Extract a px width from one track (0 for fr/minmax/non-px tracks). */
export function trackPx(track: string): number {
  const match = /^(-?[\d.]+)px$/.exec(track.trim())
  return match === null ? 0 : Number(match[1])
}

/** One drag handle's geometry (hit zone + visual line). */
export const EXPLORER_HANDLE_WIDTH = 12
export const PREVIEW_HANDLE_WIDTH = 20

/** The layout controller: frame sync, handles, floating button, width math. */
export class PanelLayoutController {
  private frame: HTMLElement | null = null
  private previewCol: HTMLDivElement | null = null
  private explorerCol: HTMLDivElement | null = null
  private explorerHandle: HTMLDivElement | null = null
  private previewHandle: HTMLDivElement | null = null
  private floatingButton: HTMLButtonElement | null = null
  private styleObserver: MutationObserver | null = null
  private sizeObserver: ResizeObserver | null = null
  private waitObserver: MutationObserver | null = null
  private frameWidth = 0
  /** The shell's own 3 tracks (sidebar, center, details). */
  private shellTracks: string[] = []
  private instantTimer: ReturnType<typeof setTimeout> | undefined
  private disposers: Array<() => void> = []

  constructor(private readonly layout: LayoutStore) {}

  /** Start watching for the frame and attach once it appears. */
  mount(): void {
    const tryAttach = (): void => {
      if (this.frame !== null) return
      const frame = findFrame()
      if (frame === null) return
      this.attach(frame)
    }
    this.waitObserver = new MutationObserver(() => { tryAttach() })
    this.waitObserver.observe(document.body, { childList: true, subtree: true })
    tryAttach()
  }

  /** Attach to the frame: columns, handles, observers, store subscription. */
  private attach(frame: HTMLElement): void {
    this.frame = frame
    frameElement = frame

    const makeCol = (dataset: string, className: string): HTMLDivElement => {
      const col = document.createElement('div')
      col.setAttribute(dataset, '')
      col.className = className
      col.style.minWidth = '0'
      col.style.overflow = 'hidden'
      col.style.display = 'flex'
      col.style.flexDirection = 'column'
      col.style.borderLeft = '1px solid var(--aion-bg-3, #e5e6eb)'
      return col
    }

    // Column order left→right: preview, workbench panel.
    const previewCol = makeCol('data-aionui-preview-col', 'aionui-preview-col')
    const explorerCol = makeCol('data-aionui-explorer-col', 'aionui-explorer-col')

    frame.appendChild(previewCol)
    frame.appendChild(explorerCol)
    this.previewCol = previewCol
    this.explorerCol = explorerCol

    this.explorerHandle = this.createHandle('aionui-explorer-handle', EXPLORER_HANDLE_WIDTH, true, 'explorer')
    this.previewHandle = this.createHandle('aionui-preview-handle', PREVIEW_HANDLE_WIDTH, true, 'preview')
    frame.appendChild(this.explorerHandle)
    frame.appendChild(this.previewHandle)

    this.floatingButton = document.createElement('button')
    this.floatingButton.type = 'button'
    this.floatingButton.className = 'aionui-floating-expand'
    this.floatingButton.setAttribute('aria-label', 'Expand panel')
    this.floatingButton.title = '展开面板'
    // Chevron points left (into the panel that will slide out from this tab).
    this.floatingButton.innerHTML = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>'
    this.floatingButton.addEventListener('click', () => { this.toggleExplorer() })
    document.body.appendChild(this.floatingButton)

    const syncGrid = (): void => {
      const el = this.frame
      if (el === null) return
      const inline = el.style.gridTemplateColumns
      if (inline === '') return
      const tracks = parseGridTracks(inline)
      if (tracks.length >= 2 && tracks.length <= 3) {
        this.shellTracks = tracks
        this.applyGrid()
        return
      }
      if (tracks.length === 5 && this.shellTracks.length === 3) {
        // Our own write — keep it.
        return
      }
    }
    this.styleObserver = new MutationObserver(syncGrid)
    this.styleObserver.observe(frame, { attributes: true, attributeFilter: ['style'] })

    const measure = (): void => {
      if (this.frame === null) return
      this.frameWidth = this.frame.getBoundingClientRect().width
      const sidebar = this.shellTracks.length >= 1 ? trackPx(this.shellTracks[0]) : 0
      const details = this.shellTracks.length >= 3 ? trackPx(this.shellTracks[2]) : 0
      const available = Math.max(0, this.frameWidth - sidebar - details)
      const state = this.layout.getSnapshot()
      if (Math.abs(state.availableWidth - available) > 0.5) {
        this.layout.update((prev) => ({ ...prev, availableWidth: available }))
      }
      this.layout.shrinkToFit(this.layout.getSnapshot())
    }
    this.sizeObserver = new ResizeObserver(() => {
      measure()
      this.applyGrid()
    })
    this.sizeObserver.observe(frame)

    this.disposers.push(this.layout.subscribe(() => this.applyGrid()))

    const initial = frame.style.gridTemplateColumns
    if (initial !== '') {
      const tracks = parseGridTracks(initial)
      if (tracks.length >= 2 && tracks.length <= 3) {
        this.shellTracks = tracks
      } else if (tracks.length === 5 && trackPx(tracks[0]) > 0) {
        this.shellTracks = tracks.slice(0, 3)
      }
    }
    measure()
    this.applyGrid()
  }

  /** Create one drag handle element with its pointer wiring. */
  private createHandle(
    className: string,
    hitWidth: number,
    reverse: boolean,
    kind: 'explorer' | 'preview',
  ): HTMLDivElement {
    const el = document.createElement('div')
    el.className = className
    el.style.position = 'absolute'
    el.style.top = '0'
    el.style.bottom = '0'
    el.style.zIndex = '30'
    el.style.cursor = 'col-resize'
    el.style.width = `${hitWidth}px`
    if (reverse) {
      el.style.marginLeft = `-${hitWidth}px`
    }
    el.addEventListener('pointerdown', (event: PointerEvent) => {
      handlePointerDragStart(event, el, {
        reverse,
        getStartWidth: () => {
          const state = this.layout.getSnapshot()
          return kind === 'explorer' ? state.explorerWidth : state.previewWidth
        },
        compute: (startWidth, deltaX) => {
          if (kind === 'explorer') return Math.min(MAX_WORKSPACE_PANEL_PX, Math.max(MIN_WORKSPACE_PANEL_PX, startWidth + deltaX))
          return Math.min(MAX_PREVIEW_REGION_PX, Math.max(MIN_PREVIEW_PANEL_PX, startWidth + deltaX))
        },
        onFrame: (width) => {
          this.layout.update((prev) => {
            if (kind === 'explorer') return { ...prev, explorerWidth: width }
            return { ...prev, previewWidth: width }
          })
        },
        onEnd: (width) => {
          const key = kind === 'explorer' ? KEY_EXPLORER_WIDTH : KEY_PREVIEW_WIDTH
          writeStoredNumber(key, width)
        },
      })
    })
    el.addEventListener('dblclick', () => {
      this.instant(() => {
        const width = kind === 'explorer' ? DEFAULT_WORKSPACE_PANEL_PX : DEFAULT_PREVIEW_REGION_PX
        const key = kind === 'explorer' ? KEY_EXPLORER_WIDTH : KEY_PREVIEW_WIDTH
        this.layout.update((prev) => {
          if (kind === 'explorer') return { ...prev, explorerWidth: width }
          return { ...prev, previewWidth: width }
        })
        writeStoredNumber(key, width)
        this.applyGrid()
      })
    })
    return el
  }

  /** Toggle the workbench panel collapse (width 0, kept mounted; no transition). */
  toggleExplorer(): void {
    const state = this.layout.getSnapshot()
    const next = !state.explorerCollapsed
    this.instant(() => {
      this.layout.update((prev) => ({ ...prev, explorerCollapsed: next }))
      try {
        localStorage.setItem(`project-panel-collapse:${state.root}`, next ? 'collapsed' : 'expanded')
      } catch {
        // best-effort
      }
      this.applyGrid()
    })
  }

  /** Toggle the preview region (open = tabs exist; close keeps tabs). */
  setPreviewOpen(open: boolean): void {
    this.instant(() => {
      this.layout.update((prev) => ({ ...prev, previewOpen: open }))
      this.applyGrid()
    })
  }

  /** Apply one store update with transitions disabled for exactly one frame. */
  private instant(fn: () => void): void {
    const frame = this.frame
    if (frame === null) {
      fn()
      return
    }
    frame.setAttribute('data-aionui-instant', '')
    if (this.instantTimer !== undefined) clearTimeout(this.instantTimer)
    this.instantTimer = setTimeout(() => {
      this.instantTimer = undefined
      frame.removeAttribute('data-aionui-instant')
    }, 0)
    fn()
  }

  /** Re-write the frame grid and reposition handles + floating button. */
  private applyGrid(): void {
    const frame = this.frame
    if (frame === null) return
    if (this.shellTracks.length !== 3) return
    const state = this.layout.getSnapshot()
    const explorer = this.layout.explorerWidthPx(state)
    const preview = this.layout.previewWidthPx(state)

    // Five tracks: shell sidebar, center, shell details, preview, workbench.
    frame.style.gridTemplateColumns =
      `${this.shellTracks[0]} minmax(0, 1fr) ${this.shellTracks[2]} ${Math.round(preview)}px ${Math.round(explorer)}px`

    if (this.explorerCol !== null) {
      this.explorerCol.style.visibility = explorer > 0 ? 'visible' : 'hidden'
    }
    if (this.previewCol !== null) {
      this.previewCol.style.visibility = preview > 0 ? 'visible' : 'hidden'
    }

    const width = this.frameWidth > 0 ? this.frameWidth : frame.getBoundingClientRect().width
    if (this.explorerHandle !== null) {
      const left = Math.round(width - explorer)
      this.explorerHandle.style.left = `${left}px`
      this.explorerHandle.style.marginLeft = `${-EXPLORER_HANDLE_WIDTH / 2}px`
      this.explorerHandle.style.display = explorer > 0 && state.root !== '' ? 'block' : 'none'
    }
    if (this.previewHandle !== null) {
      const left = Math.round(width - explorer - preview)
      this.previewHandle.style.left = `${left}px`
      this.previewHandle.style.display = preview > 0 && state.root !== '' ? 'block' : 'none'
    }

    if (this.floatingButton !== null) {
      const show = state.root !== '' && state.explorerCollapsed
      this.floatingButton.style.display = show ? 'flex' : 'none'
    }
  }

  /** Detach everything (plugin unload). */
  dispose(): void {
    this.waitObserver?.disconnect()
    this.styleObserver?.disconnect()
    this.sizeObserver?.disconnect()
    for (const dispose of this.disposers) dispose()
    this.previewCol?.remove()
    this.explorerCol?.remove()
    this.explorerHandle?.remove()
    this.previewHandle?.remove()
    this.floatingButton?.remove()
    if (this.instantTimer !== undefined) clearTimeout(this.instantTimer)
    if (frameElement === this.frame) frameElement = null
    this.frame = null
  }
}
