/**
 * The inline Git graph (the 图表 section of the Git column): a collapsible
 * read-only commit list with lane topology, ref labels, and paging. Adapted
 * from dsh-web-ui's GraphDialog (BSD-3-Clause), re-seated as an always-mounted
 * panel section (no backdrop, no close button).
 *
 * Performance: the graph subscribes to the git store plus two *selected* scm
 * flags (gitMissing / section collapsed) instead of the full scm snapshot, so
 * status refreshes never re-render the graph; rows are memoized; and only the
 * rows inside the viewport (+ overscan) are mounted (fixed 48px row height).
 * @module dsh-workbench/client/components/GraphPanel
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { computeLanes, type LaneGlyph } from '../../core/types.ts'
import type { GraphCommit, GraphView } from '../../core/types.ts'
import { t } from '../locales.ts'
import { useStore, useStoreSelect } from '../hooks/useStore.ts'
import type { PanelStores, ScmState } from '../store.ts'
import { cx } from './cx.ts'
import { activateOnKey } from './a11y.ts'
import { ChevronRightIcon } from './icons.tsx'
import gitCss from '../styles/git.module.css'
import scmCss from '../styles/scm.module.css'

/** Initial page size of the graph fetch. */
const INITIAL_LIMIT = 200
/** Page size of one "load more" step. */
const PAGE_STEP = 100
/** Fixed row height (px) — must match .graphRow in git.module.css. */
const ROW_HEIGHT = 48
/** Rows rendered above/below the viewport to hide scroll flicker. */
const OVERSCAN = 8

/** Lane glyph → the rendered monospace character. */
function glyphChar(glyph: LaneGlyph): string {
  switch (glyph) {
    case 'node': return '●'
    case 'merge': return '◆'
    case 'pass': return '│'
    case 'gap': return ' '
  }
}

/** Seconds per time bucket (relative timestamps). */
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A compact relative timestamp (GitHub-style), falling back to a plain date past 30 days. */
function formatTime(epochSeconds: number): string {
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds)
  if (elapsed < MINUTE) return t('git.graph.time.justNow')
  if (elapsed < HOUR) return t('git.graph.time.minutesAgo', { count: Math.floor(elapsed / MINUTE) })
  if (elapsed < DAY) return t('git.graph.time.hoursAgo', { count: Math.floor(elapsed / HOUR) })
  if (elapsed < 30 * DAY) return t('git.graph.time.daysAgo', { count: Math.floor(elapsed / DAY) })
  const date = new Date(epochSeconds * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Stable selectors: the graph only cares about these scm flags. */
const selectGitMissing = (s: ScmState): boolean => s.gitMissing
const selectGraphOpen = (s: ScmState): boolean => s.sectionCollapsed['graph'] !== true

/** One commit row. Memoized: props are stable while the graph view is
 *  unchanged, so git-store churn (typing a commit message) re-renders the
 *  container but never the rows. */
const GraphRow = memo(function GraphRow({
  commit,
  glyphs,
  branch,
}: {
  commit: GraphCommit
  glyphs: LaneGlyph[]
  branch: string
}): JSX.Element {
  return (
    <div className={gitCss.graphRow} title={commit.subject}>
      <span className={gitCss.graphLanes} aria-hidden="true">
        {glyphs.map((glyph, column) => (
          <span
            key={column}
            className={cx(
              gitCss.graphLaneCell,
              glyph === 'node' && gitCss.graphLaneNode,
              glyph === 'merge' && gitCss.graphLaneMerge,
              glyph === 'pass' && gitCss.graphLanePass,
            )}
          >
            {glyphChar(glyph)}
          </span>
        ))}
      </span>
      <span className={gitCss.graphOid} title={commit.oid}>{commit.oid.slice(0, 7)}</span>
      <span className={gitCss.graphMain}>
        <span className={gitCss.graphSubject} title={commit.subject}>{commit.subject}</span>
        <span className={gitCss.graphMeta}>
          {commit.refs.map(ref => (
            <span
              key={ref}
              title={ref}
              className={cx(gitCss.graphRef, ref === branch && gitCss.graphRefCurrent)}
            >
              {ref}
            </span>
          ))}
          <span>{commit.author}</span>
          <span className={gitCss.graphMetaSep}>·</span>
          <span>{formatTime(commit.authorTime)}</span>
        </span>
      </span>
    </div>
  )
})

/** The graph pane body.
 * @param flexBasis - the section's fixed share of the column height when both
 * sections are open (set by the Git column's draggable divider); undefined
 * lets the section flex to fill the remaining space.
 */
export function GraphPanel({ stores, flexBasis }: { stores: PanelStores; flexBasis?: number }): JSX.Element {
  const git = stores.git
  const scm = stores.scm
  const state = useStore(git)
  const gitMissing = useStoreSelect(scm, selectGitMissing)
  const graphOpen = useStoreSelect(scm, selectGraphOpen)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 300 })
  const view: GraphView | null = state.graph

  useEffect(() => {
    if (state.root !== '' && !state.graphLoaded && !state.graphLoading) void git.loadGraph(INITIAL_LIMIT)
  }, [state.root, state.graphLoaded, state.graphLoading, git])

  // Track the scroll viewport so only visible rows are mounted. The body
  // stays mounted while the section is collapsed (hidden via CSS), so this
  // fires on expand and on divider drags too.
  useEffect(() => {
    const el = bodyRef.current
    if (el === null) return
    const update = (): void => setViewport({ top: el.scrollTop, height: el.clientHeight })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const lanes = useMemo(() => (view === null ? [] : computeLanes(view.commits)), [view])
  const laneCount = useMemo(() => {
    let count = 0
    for (const row of lanes) count = Math.max(count, row.columns.length)
    return count
  }, [lanes])

  const total = view === null ? 0 : view.commits.length
  const start = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(total, Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN)

  const toggleGraph = (): void => scm.setSectionCollapsed('graph', graphOpen)

  return (
    <div
      className={gitCss.graphSection}
      style={{ flex: graphOpen ? (flexBasis !== undefined ? `0 0 ${flexBasis * 100}%` : 1) : undefined }}
    >
      <div
        className={scmCss.sectionHeader}
        onClick={toggleGraph}
        onKeyDown={activateOnKey(toggleGraph)}
        role="button"
        tabIndex={0}
        aria-expanded={graphOpen}
        title={t('git.graph.title')}
      >
        <span className={`${scmCss.sectionChevron}${graphOpen ? ` ${scmCss.sectionChevronOpen}` : ''}`}>
          <ChevronRightIcon size={13} />
        </span>
        <span className={scmCss.sectionTitle}>{t('git.graph.title')}</span>
        <span className={gitCss.graphSubtitle}>
          {t('git.graph.subtitle', { count: total, lanes: laneCount })}
        </span>
      </div>
      <div className={`${gitCss.sectionBodyAnim}${graphOpen ? ` ${gitCss.sectionBodyAnimOpen}` : ''}`}>
        <div className={gitCss.sectionBodyInner}>
          <div className={gitCss.graphBody} ref={bodyRef}>
            {!state.graphLoaded && state.graphLoading
              ? <div className={gitCss.graphEmpty}>{t('git.graph.loading')}</div>
              : view === null
                ? <div className={gitCss.graphEmpty}>{gitMissing ? t('scm.gitMissing') : t('git.graph.notRepo')}</div>
                : view.commits.length === 0
                  ? <div className={gitCss.graphEmpty}>{t('git.graph.empty')}</div>
                  : (
                    <>
                      <div style={{ height: start * ROW_HEIGHT }} aria-hidden="true" />
                      {view.commits.slice(start, end).map((commit, i) => (
                        <GraphRow
                          key={commit.oid}
                          commit={commit}
                          glyphs={lanes[start + i]?.columns ?? []}
                          branch={view.branch}
                        />
                      ))}
                      <div style={{ height: (total - end) * ROW_HEIGHT }} aria-hidden="true" />
                    </>
                  )}
          </div>
          {view !== null && view.hasMore && (
            <button
              type="button"
              className={gitCss.graphMore}
              onClick={() => { void git.loadGraph(view.commits.length + PAGE_STEP) }}
            >
              {t('git.graph.loadMore')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
