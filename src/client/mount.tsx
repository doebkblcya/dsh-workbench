/**
 * DOM mounting: two React roots rendered into the panel columns the layout
 * controller appends to the frame grid — preview, and the workbench panel
 * (Files/Git tabs). The roots wait for their columns (the shell mounts
 * asynchronously), and everything is wrapped so a DOM failure degrades the
 * panels, never the GUI.
 * @module dsh-workbench/client/mount
 */

import { createRoot, type Root } from 'react-dom/client'
import type { PanelStores } from './store.ts'
import { WorkbenchPanel } from './components/WorkbenchPanel.tsx'
import { PreviewPanel } from './preview/PreviewPanel.tsx'

const EXPLORER_COL_SELECTOR = '[data-aionui-explorer-col]'
const PREVIEW_COL_SELECTOR = '[data-aionui-preview-col]'

/** Wait for one selector (the shell/frame mounts after boot settlement). */
function waitForElement(selector: string, onFound: (el: HTMLElement) => void): () => void {
  let disposed = false
  let observer: MutationObserver | undefined
  const tryFind = (): void => {
    if (disposed) return
    const el = document.querySelector<HTMLElement>(selector)
    if (el !== null) {
      observer?.disconnect()
      onFound(el)
    }
  }
  observer = new MutationObserver(() => { tryFind() })
  observer.observe(document.body, { childList: true, subtree: true })
  tryFind()
  return () => {
    disposed = true
    observer?.disconnect()
  }
}

/**
 * Mount all three panel roots.
 * @param stores - the panel store bundle.
 * @param onToggleExplorer - collapse toggle (owned by the layout controller).
 * @returns a disposer unmounting all three trees.
 */
export function mountPanels(stores: PanelStores, onToggleExplorer: () => void): () => void {
  let explorerRoot: Root | undefined
  let previewRoot: Root | undefined
  const disposers: Array<() => void> = []

  disposers.push(waitForElement(EXPLORER_COL_SELECTOR, (el) => {
    explorerRoot = createRoot(el)
    explorerRoot.render(<WorkbenchPanel stores={stores} onToggleCollapse={onToggleExplorer} />)
  }))
  disposers.push(waitForElement(PREVIEW_COL_SELECTOR, (el) => {
    previewRoot = createRoot(el)
    previewRoot.render(<PreviewPanel stores={stores} />)
  }))

  return () => {
    for (const dispose of disposers) dispose()
    explorerRoot?.unmount()
    previewRoot?.unmount()
  }
}
