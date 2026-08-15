/**
 * The Git column: a VS Code Source-Control-like pane with two stacked
 * collapsible sections — 更改 (branch bar + commit box + changes list) and
 * 图表 (the inline git graph). While both sections are open a draggable
 * divider adjusts their height split; collapsing either section hides the
 * divider and lets the other fill the column.
 * @module dsh-workbench/client/components/GitPanel
 */

import { useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import { useStoreSelect } from '../hooks/useStore.ts'
import type { PanelStores, ScmState } from '../store.ts'
import { ScmPanel } from './ScmPanel.tsx'
import { CreateBranchDialog } from './CreateBranchDialog.tsx'
import { GraphPanel } from './GraphPanel.tsx'
import gitCss from '../styles/git.module.css'

/** Graph share bounds for the draggable divider (fraction of the column height). */
const MIN_SPLIT = 0.18
const MAX_SPLIT = 0.8

/** Stable selectors: the layout only cares about the two collapse flags. */
const selectChangesOpen = (s: ScmState): boolean => s.sectionCollapsed['changes'] !== true
const selectGraphOpen = (s: ScmState): boolean => s.sectionCollapsed['graph'] !== true

/** The Git column content. */
export function GitPanel({ stores }: { stores: PanelStores }): JSX.Element {
  const scm = stores.scm
  const changesOpen = useStoreSelect(scm, selectChangesOpen)
  const graphOpen = useStoreSelect(scm, selectGraphOpen)
  const [createOpen, setCreateOpen] = useState(false)
  const [splitRatio, setSplitRatio] = useState(0.42)
  const containerRef = useRef<HTMLDivElement>(null)

  const bothOpen = changesOpen && graphOpen

  const onDividerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const container = containerRef.current
    if (container === null) return
    const startY = event.clientY
    const startRatio = splitRatio
    const height = container.clientHeight
    const onMove = (ev: PointerEvent): void => {
      const delta = (startY - ev.clientY) / height
      setSplitRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, startRatio + delta)))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className={`aionui-root ${gitCss.root}`}>
      {/* Stacked collapsible sections (VS Code style): 更改 + 图表. */}
      <div className={gitCss.sections} ref={containerRef}>
        <ScmPanel stores={stores} onCreateBranch={() => setCreateOpen(true)} />
        {bothOpen && (
          <div className={gitCss.divider} onPointerDown={onDividerDown} role="separator" aria-orientation="horizontal" />
        )}
        <GraphPanel stores={stores} flexBasis={bothOpen ? splitRatio : undefined} />
      </div>

      {createOpen && <CreateBranchDialog stores={stores} onClose={() => setCreateOpen(false)} />}
    </div>
  )
}
