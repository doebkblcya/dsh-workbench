/**
 * The inline Git graph panel (bottom half of the Git column): a read-only
 * commit list with lane topology, ref labels, and paging. Adapted from
 * dsh-web-ui's GraphDialog (BSD-3-Clause), re-seated as an always-mounted
 * panel pane (no backdrop, no close button).
 * @module dsh-workbench/client/components/GraphPanel
 */

import { useEffect, useMemo } from 'react'
import type { JSX } from 'react'
import { computeLanes, type LaneGlyph } from '../../core/types.ts'
import type { GraphView } from '../../core/types.ts'
import { t } from '../locales.ts'
import { useStore } from '../hooks/useStore.ts'
import type { PanelStores } from '../store.ts'
import { cx } from './cx.ts'
import gitCss from '../styles/git.module.css'

/** Initial page size of the graph fetch. */
const INITIAL_LIMIT = 200
/** Page size of one "load more" step. */
const PAGE_STEP = 100

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

/** The graph pane body. */
export function GraphPanel({ stores }: { stores: PanelStores }): JSX.Element {
  const git = stores.git
  const scm = stores.scm
  const state = useStore(git)
  const scmState = useStore(scm)
  const view: GraphView | null = state.graph

  useEffect(() => {
    if (state.root !== '' && !state.graphLoaded && !state.graphLoading) void git.loadGraph(INITIAL_LIMIT)
  }, [state.root, state.graphLoaded, state.graphLoading, git])

  const lanes = useMemo(() => (view === null ? [] : computeLanes(view.commits)), [view])
  const laneCount = useMemo(() => {
    let count = 0
    for (const row of lanes) count = Math.max(count, row.columns.length)
    return count
  }, [lanes])

  return (
    <div className={gitCss.graphPane}>
      <div className={gitCss.graphHeader}>
        <span className={gitCss.graphTitle}>{t('git.graph.title')}</span>
        <span className={gitCss.graphSubtitle}>
          {t('git.graph.subtitle', { count: view === null ? 0 : view.commits.length, lanes: laneCount })}
        </span>
      </div>
      <div className={gitCss.graphBody}>
        {!state.graphLoaded && state.graphLoading
          ? <div className={gitCss.graphEmpty}>{t('git.graph.loading')}</div>
          : view === null
            ? <div className={gitCss.graphEmpty}>{scmState.gitMissing ? t('scm.gitMissing') : t('git.graph.notRepo')}</div>
            : view.commits.length === 0
              ? <div className={gitCss.graphEmpty}>{t('git.graph.empty')}</div>
              : view.commits.map((commit, index) => {
              const row = lanes[index]
              if (row === undefined) return null
              return (
                <div className={gitCss.graphRow} key={commit.oid}>
                  <span className={gitCss.graphLanes} aria-hidden="true">
                    {row.columns.map((glyph, column) => (
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
                          className={cx(gitCss.graphRef, ref === view.branch && gitCss.graphRefCurrent)}
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
            })}
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
  )
}
