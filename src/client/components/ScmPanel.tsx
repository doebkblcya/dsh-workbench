/**
 * The Changes (SCM) panel: per-repo working-tree status grouped into staged /
 * unstaged / untracked, with stage/unstage/discard actions on every row and
 * bulk actions in the section header. The host status is the only truth — no
 * optimistic rows; a failed batch surfaces its paths and the next refresh
 * clears the flag. Discard confirms with copy split by recoverability
 * (untracked = delete vs tracked = irreversible restore).
 *
 * AionUi ScmPanel behavior (Apache-2.0, re-implemented): window focus
 * refreshes (external editors write without git events), unknown states
 * render as a quiet '?', conflicted rows are visually distinct AND have no
 * actions.
 * @module dsh-workbench/client/components/ScmPanel
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { GitChangeRow } from '../../core/types.ts'
import { t, gitErrorCopy, format } from '../locales.ts'
import { useStore } from '../hooks/useStore.ts'
import type { PanelStores } from '../store.ts'
import { activateOnKey } from './a11y.ts'
import { FileTypeIcon } from './FileIcon.tsx'
import { ConfirmDialog, toast } from './overlay.tsx'
import { BranchPopover } from './BranchPopover.tsx'
import {
  BranchIcon, ChevronDownIcon, ChevronRightIcon, DownloadIcon, ListIcon, MinusIcon, PlusIcon, TreeIcon, UndoIcon, UploadIcon,
} from './icons.tsx'
import scmCss from '../styles/scm.module.css'
import gitCss from '../styles/git.module.css'

/** Minimum gap between window-focus SCM refreshes (ms). */
const FOCUS_REFRESH_MIN_MS = 5_000

/** Badge letter + color class per state. */
const BADGE: Record<string, { letter: string; className: string }> = {
  created: { letter: 'A', className: scmCss.badgeCreated },
  modified: { letter: 'M', className: scmCss.badgeModified },
  deleted: { letter: 'D', className: scmCss.badgeDeleted },
  renamed: { letter: 'R', className: scmCss.badgeCreated },
  conflicted: { letter: '!', className: scmCss.badgeConflicted },
  untracked: { letter: '?', className: scmCss.badgeUntracked },
  unknown: { letter: '?', className: scmCss.badgeUntracked },
}

/** The parent dir of a path ('' for root-level). */
function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : ''
}

/** Build a display-only directory tree from rows. */
function buildTree(rows: GitChangeRow[]): Map<string, GitChangeRow[]> {
  const byDir = new Map<string, GitChangeRow[]>()
  for (const row of rows) {
    const dir = dirOf(row.path)
    const list = byDir.get(dir)
    if (list === undefined) byDir.set(dir, [row])
    else list.push(row)
  }
  return byDir
}

/** The SCM tab body.
 * @param stores - the panel store bundle.
 * @param onCreateBranch - open the create-branch dialog (owned by the Git
 * column); the branch chip's popover lives here.
 */
export function ScmPanel({
  stores,
  onCreateBranch,
}: {
  stores: PanelStores
  onCreateBranch: () => void
}): JSX.Element {
  const scm = stores.scm
  const preview = stores.preview
  const git = stores.git
  const state = useStore(scm)
  const gitState = useStore(git)
  const [branchOpen, setBranchOpen] = useState(false)
  const [discardTargets, setDiscardTargets] = useState<GitChangeRow[] | null>(null)

  // Window focus refreshes (catches external editors writing the tree).
  // Throttled: a focus burst must not spawn a git status per event — the
  // fs watch (host) and the 30s host poll already cover the steady state.
  // -Infinity so the first focus after mount always fires (production
  // Date.now() is enormous anyway; the sentinel makes the throttle explicit
  // and testable at clock 0).
  const lastFocusRefresh = useRef(-Infinity)
  useEffect(() => {
    const onFocus = (): void => {
      const now = Date.now()
      if (now - lastFocusRefresh.current < FOCUS_REFRESH_MIN_MS) return
      lastFocusRefresh.current = now
      void scm.refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [scm])

  const status = state.status
  const changesSectionOpen = state.sectionCollapsed['changes'] !== true

  const staged = status?.staged ?? []
  const unstaged = status?.unstaged ?? []
  const untracked = status?.untracked ?? []
  const hasChanges = staged.length + unstaged.length + untracked.length > 0

  const branch = status?.branch ?? ''
  const worktreeCount = unstaged.length + untracked.length

  // The commit box lives inside the 更改 section (VS Code layout).
  const canCommit = staged.length > 0 && gitState.commitMessage.trim() !== '' && !gitState.committing
  const doCommit = (): void => {
    void git.commit().then((ok) => { if (ok) toast(t('git.commit.success')) })
  }

  /** Stage every worktree change (modified + untracked), like VS Code. */
  const stageAll = (): void => {
    void scm.stage([...unstaged.map((row) => row.path), ...untracked.map((row) => row.path)])
  }

  /** Discard all worktree changes (confirm dialog below). */
  const discardAll = (): void => {
    if (worktreeCount === 0) return
    setDiscardTargets([...unstaged, ...untracked])
  }

  const confirmDiscard = (): void => {
    if (discardTargets === null) return
    void scm.discard(discardTargets.map((row) => row.path))
    setDiscardTargets(null)
  }

  const allUntracked = discardTargets !== null && discardTargets.every((row) => row.state === 'untracked')

  /** Open the discard confirm for a set of rows (rows + top-bar discard-all). */
  const requestDiscard = (rows: GitChangeRow[]): void => {
    if (rows.length === 0) return
    setDiscardTargets(rows)
  }

  return (
    <div className={`aionui-root ${scmCss.panel}`} style={{ flex: changesSectionOpen ? 1 : undefined }}>
      {/* 更改 section header (always mounted; collapsed = 收纳成一行). */}
      <div
        className={scmCss.sectionHeader}
        onClick={() => scm.setSectionCollapsed('changes', changesSectionOpen)}
        onKeyDown={activateOnKey(() => { scm.setSectionCollapsed('changes', changesSectionOpen) })}
        role="button"
        tabIndex={0}
        aria-expanded={changesSectionOpen}
      >
        <span className={`${scmCss.sectionChevron}${changesSectionOpen ? ` ${scmCss.sectionChevronOpen}` : ''}`}>
          <ChevronRightIcon size={13} />
        </span>
        <span className={scmCss.sectionTitle}>{t('scm.changes')}</span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={`${scmCss.sectionAction}${state.viewMode === 'list' ? '' : ''}`}
            title={t('scm.viewList')}
            style={{ color: state.viewMode === 'list' ? 'var(--aion-brand)' : undefined }}
            onClick={() => scm.setViewMode('list')}
          >
            <ListIcon size={13} />
          </button>
          <button
            type="button"
            className={scmCss.sectionAction}
            title={t('scm.viewTree')}
            style={{ color: state.viewMode === 'tree' ? 'var(--aion-brand)' : undefined }}
            onClick={() => scm.setViewMode('tree')}
          >
            <TreeIcon size={13} />
          </button>
        </span>
      </div>

      {/* Animated body: branch bar + sync notice + commit box + changes list. */}
      <div className={`${gitCss.sectionBodyAnim}${changesSectionOpen ? ` ${gitCss.sectionBodyAnimOpen}` : ''}`}>
        <div className={gitCss.sectionBodyInner}>
          {/* Branch bar: branch chip + worktree ops + remote ops. */}
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
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
              <button type="button" className={gitCss.syncBtn} title={t('scm.stageAll')} disabled={worktreeCount === 0} onClick={stageAll}>
                <PlusIcon size={13} />
              </button>
              <button type="button" className={gitCss.syncBtn} title={t('scm.discardAll')} disabled={worktreeCount === 0} onClick={discardAll}>
                <UndoIcon size={13} />
              </button>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 6 }}>
              <button type="button" className={gitCss.syncBtn} title={t('git.pull')} disabled={gitState.syncing} onClick={() => void git.pull()}>
                <DownloadIcon size={13} />
              </button>
              <button type="button" className={gitCss.syncBtn} title={t('git.push')} disabled={gitState.syncing} onClick={() => void git.push()}>
                <UploadIcon size={13} />
              </button>
            </span>
            {branchOpen && (
              <BranchPopover
                stores={stores}
                onClose={() => setBranchOpen(false)}
                onCreate={() => { setBranchOpen(false); onCreateBranch() }}
              />
            )}
          </div>

          {(gitState.syncError !== null || gitState.syncNotice !== null) && (
            <div className={gitCss.syncNotice}>
              {gitState.syncError !== null ? gitErrorCopy(gitState.syncError) : gitState.syncNotice}
            </div>
          )}

          {/* Commit box: only meaningful in a repo. */}
          {status !== null && (
            <div className={gitCss.commitBox}>
              <textarea
                className={gitCss.commitInput}
                value={gitState.commitMessage}
                placeholder={t('git.commit.message')}
                onChange={(event) => git.setCommitMessage(event.target.value)}
                onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') doCommit() }}
                rows={3}
              />
              <div className={gitCss.commitRow}>
                <span className={gitCss.commitMeta}>{staged.length > 0 ? `${staged.length} ${t('scm.staged')}` : ''}</span>
                <button type="button" className={gitCss.commitBtn} disabled={!canCommit} onClick={doCommit}>
                  {gitState.committing ? t('git.sync.loading') : t('git.commit.button')}
                </button>
              </div>
              {gitState.commitError !== null && <div className={gitCss.error}>{gitErrorCopy(gitState.commitError)}</div>}
            </div>
          )}

          <div className={scmCss.sectionBody}>
            {status === null
              ? state.loading
                ? <div className={scmCss.loading}>{t('scm.loading')}</div>
                : state.gitMissing
                  ? <div className={scmCss.notRepo}>{t('scm.gitMissing')}</div>
                  : <div className={scmCss.notRepo}>{t('scm.notRepo')}</div>
              : (
                <>
                  {!hasChanges && <div className={scmCss.empty}>{t('scm.empty')}</div>}
                  {hasChanges && (
                    <Group
                      scm={scm}
                      preview={preview}
                      title={staged.length > 0 ? t('scm.staged') : undefined}
                      rows={staged}
                      bulkLabel={t('scm.unstage')}
                      onBulk={(rows) => void scm.unstage(rows.map((row) => row.path))}
                      onDiscard={requestDiscard}
                    />
                  )}
                  {hasChanges && unstaged.length > 0 && (
                    <Group
                      scm={scm}
                      preview={preview}
                      rows={unstaged}
                      bulkLabel={t('scm.stage')}
                      onBulk={(rows) => void scm.stage(rows.map((row) => row.path))}
                      onDiscard={requestDiscard}
                    />
                  )}
                  {untracked.length > 0 && (
                    <Group
                      scm={scm}
                      preview={preview}
                      title={t('scm.untracked')}
                      rows={untracked}
                      bulkLabel={t('scm.stage')}
                      onBulk={(rows) => void scm.stage(rows.map((row) => row.path))}
                      onDiscard={requestDiscard}
                    />
                  )}
                </>
              )}
          </div>
        </div>
      </div>

      {discardTargets !== null && (
        <ConfirmDialog
          title={t('scm.discard')}
          body={allUntracked
            ? format(t('scm.discardConfirmUntracked'), { count: discardTargets.length })
            : format(t('scm.discardConfirmTracked'), { count: discardTargets.length })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={confirmDiscard}
          onCancel={() => setDiscardTargets(null)}
        />
      )}
    </div>
  )
}

/** One change group (staged / unstaged / untracked) with list or tree body. */
function Group({
  scm,
  preview,
  rows,
  title,
  bulkLabel,
  onBulk,
  onDiscard,
}: {
  scm: PanelStores['scm']
  preview: PanelStores['preview']
  rows: GitChangeRow[]
  title?: string
  bulkLabel: string
  onBulk: (rows: GitChangeRow[]) => void
  onDiscard: (rows: GitChangeRow[]) => void
}): JSX.Element {
  const state = useStore(scm)
  const tree = useMemo(() => buildTree(rows), [rows])
  const viewTree = state.viewMode === 'tree'
  const allActionable = rows.filter((row) => row.state !== 'conflicted')

  return (
    <div>
      {title !== undefined && (
        <div className={scmCss.groupTitle}>
          {title}
          <button
            type="button"
            className={scmCss.groupAction}
            title={bulkLabel}
            onClick={() => onBulk(allActionable)}
            disabled={allActionable.length === 0}
          >
            {bulkLabel === t('scm.unstage') ? <MinusIcon size={12} /> : <PlusIcon size={12} />}
          </button>
        </div>
      )}
      {viewTree ? (
        [...tree.entries()].map(([dir, dirRows]) => (
          <DirNode
            key={dir === '' ? '\u0000' : dir}
            dir={dir}
            rows={dirRows}
            depth={0}
            state={state}
            scm={scm}
            preview={preview}
            onDiscard={onDiscard}
          />
        ))
      ) : (
        rows.map((row) => (
          <ChangeRow
            key={`${row.staged ? 's' : 'u'}:${row.path}`}
            row={row}
            state={state}
            scm={scm}
            preview={preview}
            onDiscard={onDiscard}
          />
        ))
      )}
    </div>
  )
}

/** Tree-view directory node (expandable). */
function DirNode({
  dir,
  rows,
  depth,
  state,
  scm,
  preview,
  onDiscard,
}: {
  dir: string
  rows: GitChangeRow[]
  depth: number
  state: ReturnType<PanelStores['scm']['getSnapshot']>
  scm: PanelStores['scm']
  preview: PanelStores['preview']
  onDiscard: (rows: GitChangeRow[]) => void
}): JSX.Element {
  const expanded = state.treeExpanded.includes(dir)
  const label = dir === '' ? '/' : dir.split('/').pop() ?? dir
  const toggleExpanded = (): void => {
    const next = expanded
      ? state.treeExpanded.filter((item) => item !== dir)
      : [...state.treeExpanded, dir]
    scm.setTreeExpanded(next)
  }
  return (
    <>
      <div
        className={scmCss.dirRow}
        style={{ paddingLeft: 12 + depth * 12 }}
        title={dir}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggleExpanded}
        onKeyDown={activateOnKey(toggleExpanded)}
      >
        <span className={`${scmCss.dirArrow}${expanded ? ` ${scmCss.dirArrowOpen}` : ''}`}>
          <ChevronRightIcon size={13} />
        </span>
        <FileTypeIcon name={label} isDir expanded={expanded} />
        <span style={{ fontSize: 13, color: 'var(--aion-text-primary)' }}>{label}</span>
      </div>
      {expanded &&
        rows.map((row) => (
          <ChangeRow
            key={`${row.staged ? 's' : 'u'}:${row.path}`}
            row={row}
            state={state}
            scm={scm}
            preview={preview}
            onDiscard={onDiscard}
            indent={depth + 1}
            hideDir
          />
        ))}
    </>
  )
}

/** One change row: badge + name + dimmed dir + hover actions.
 * Clicking the row opens the path's diff in the preview panel (every state
 * has a diff — deleted rows show the removal, untracked rows a new-file diff).
 */
function ChangeRow({
  row,
  state,
  scm,
  preview,
  onDiscard,
  indent = 0,
  hideDir = false,
}: {
  row: GitChangeRow
  state: ReturnType<PanelStores['scm']['getSnapshot']>
  scm: PanelStores['scm']
  preview: PanelStores['preview']
  onDiscard: (rows: GitChangeRow[]) => void
  indent?: number
  hideDir?: boolean
}): JSX.Element {
  const badge = BADGE[row.state] ?? BADGE.unknown
  const busy = state.busy.includes(row.path)
  const failed = state.failed.includes(row.path)
  const conflicted = row.state === 'conflicted'
  const displayName = row.oldPath !== undefined ? `${row.oldPath.split('/').pop()} -> ${row.path.split('/').pop()}` : (row.path.split('/').pop() ?? row.path)
  const dir = dirOf(row.path)

  const openInPreview = (): void => {
    scm.select(row.path)
    // Staged rows diff the index against HEAD; unstaged rows the worktree
    // against the index — the side the row was listed under.
    preview.openDiff(state.root, row.path, row.staged)
  }

  return (
    <div
      className={`${scmCss.changeRow}${state.selected === row.path ? ` ${scmCss.changeRowSelected}` : ''}${failed ? ` ${scmCss.rowFailed}` : ''}`}
      style={{ paddingLeft: 12 + indent * 12 }}
      title={row.path}
      onClick={openInPreview}
      onKeyDown={activateOnKey(openInPreview)}
      role="button"
      tabIndex={0}
    >
      <span className={`${scmCss.badge} ${badge.className}`}>{badge.letter}</span>
      <span className={scmCss.changeName}>{displayName}</span>
      {!hideDir && dir !== '' && <span className={scmCss.changeDir}>{dir}</span>}
      <span className={`${scmCss.rowActions}${busy || failed ? ` ${scmCss.rowActionsVisible}` : ''}`}>
        {conflicted ? null : row.staged ? (
          <>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.unstage')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); void scm.unstage([row.path]) }}
            >
              <MinusIcon size={13} />
            </button>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.discard')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onDiscard([row]) }}
            >
              <UndoIcon size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.stage')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); void scm.stage([row.path]) }}
            >
              <PlusIcon size={13} />
            </button>
            <button
              type="button"
              className={scmCss.rowAction}
              title={t('scm.discard')}
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onDiscard([row]) }}
            >
              <UndoIcon size={13} />
            </button>
          </>
        )}
      </span>
    </div>
  )
}
