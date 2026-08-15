/**
 * The Git column: a VS Code Source-Control-like pane split vertically —
 * top half = branch bar + commit box + changes list (stage/unstage/discard),
 * bottom half = the inline Git graph. The split is draggable.
 * @module dsh-workbench/client/components/GitPanel
 */

import { useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import { t, gitErrorCopy } from '../locales.ts'
import { useStore } from '../hooks/useStore.ts'
import type { PanelStores } from '../store.ts'
import { ScmPanel } from './ScmPanel.tsx'
import { BranchPopover } from './BranchPopover.tsx'
import { CreateBranchDialog } from './CreateBranchDialog.tsx'
import { GraphPanel } from './GraphPanel.tsx'
import { toast } from './overlay.tsx'
import { BranchIcon, ChevronDownIcon, DownloadIcon, UploadIcon } from './icons.tsx'
import gitCss from '../styles/git.module.css'

/** Split bounds for the graph pane (fraction of the column height). */
const MIN_SPLIT = 0.18
const MAX_SPLIT = 0.8

/** The Git column content. */
export function GitPanel({ stores }: { stores: PanelStores }): JSX.Element {
  const git = stores.git
  const scm = stores.scm
  const state = useStore(git)
  const scmState = useStore(scm)
  const [branchOpen, setBranchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [splitRatio, setSplitRatio] = useState(0.42)
  const containerRef = useRef<HTMLDivElement>(null)

  const branch = scmState.status?.branch ?? ''
  const stagedCount = scmState.status?.staged.length ?? 0
  const canCommit = stagedCount > 0 && state.commitMessage.trim() !== '' && !state.committing

  const doCommit = (): void => {
    void git.commit().then((ok) => { if (ok) toast(t('git.commit.success')) })
  }

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
    <div ref={containerRef} className={`aionui-root ${gitCss.root}`}>
      {/* Branch bar (the chip removed from the input header lives here). */}
      <div className={gitCss.branchBar}>
        <button
          type="button"
          className={gitCss.branchBtn}
          onClick={() => setBranchOpen((o) => !o)}
          aria-expanded={branchOpen}
          title={branch === '' ? t('git.branch.detached') : branch}
        >
          <BranchIcon size={14} />
          <span className={gitCss.branchLabel}>{branch === '' ? t('git.branch.detached') : branch}</span>
          <ChevronDownIcon size={12} />
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button type="button" className={gitCss.syncBtn} title={t('git.pull')} disabled={state.syncing} onClick={() => void git.pull()}>
            <DownloadIcon size={13} />
          </button>
          <button type="button" className={gitCss.syncBtn} title={t('git.push')} disabled={state.syncing} onClick={() => void git.push()}>
            <UploadIcon size={13} />
          </button>
        </span>
        {branchOpen && (
          <BranchPopover
            stores={stores}
            onClose={() => setBranchOpen(false)}
            onCreate={() => { setBranchOpen(false); setCreateOpen(true) }}
          />
        )}
      </div>

      {(state.syncError !== null || state.syncNotice !== null) && (
        <div className={gitCss.syncNotice}>
          {state.syncError !== null ? gitErrorCopy(state.syncError) : state.syncNotice}
        </div>
      )}

      {/* Commit box. */}
      <div className={gitCss.commitBox}>
        <textarea
          className={gitCss.commitInput}
          value={state.commitMessage}
          placeholder={t('git.commit.message')}
          onChange={(event) => git.setCommitMessage(event.target.value)}
          onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') doCommit() }}
          rows={3}
        />
        <div className={gitCss.commitRow}>
          <span className={gitCss.commitMeta}>{stagedCount > 0 ? `${stagedCount} ${t('scm.staged')}` : ''}</span>
          <button type="button" className={gitCss.commitBtn} disabled={!canCommit} onClick={doCommit}>
            {state.committing ? t('git.sync.loading') : t('git.commit.button')}
          </button>
        </div>
        {state.commitError !== null && <div className={gitCss.error}>{gitErrorCopy(state.commitError)}</div>}
      </div>

      {/* Changes list (top pane). */}
      <div className={gitCss.changesPane}>
        <ScmPanel stores={stores} />
      </div>

      {/* Split divider. */}
      <div className={gitCss.divider} onPointerDown={onDividerDown} role="separator" aria-orientation="horizontal" />

      {/* Graph (bottom pane). */}
      <div className={gitCss.graphPaneWrap} style={{ flex: `0 0 ${Math.round(splitRatio * 100)}%` }}>
        <GraphPanel stores={stores} />
      </div>

      {createOpen && <CreateBranchDialog stores={stores} onClose={() => setCreateOpen(false)} />}
    </div>
  )
}
