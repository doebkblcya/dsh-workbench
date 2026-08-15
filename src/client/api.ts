/**
 * Browser client for the host routes: typed JSON envelope calls over
 * /workbench/* (fs) and /git/* (git), plus the SSE change subscription at
 * /workbench/events. Same-origin relative fetch (the page and the routes share
 * the webserver).
 * @module dsh-workbench/client/api
 */

import type {
  BranchesView, CommitResult, DirListing, FileRead, GitBatchResult, GitStatusView,
  GraphView, PanelEnvelope, PanelError, SearchView, SwitchResult, SyncResult,
} from '../core/types.ts'

/** Transport failure (fetch threw or the response was not JSON). */
const TRANSPORT_ERROR: PanelError = { code: 'internal', message: 'workbench route unavailable' }

/** POST one JSON payload and decode the envelope; never throws. */
async function post<T>(path: string, payload: Record<string, unknown>): Promise<PanelEnvelope<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
  try {
    const envelope = await response.json() as unknown
    if (typeof envelope !== 'object' || envelope === null) return { ok: false, error: TRANSPORT_ERROR }
    const record = envelope as Record<string, unknown>
    if (record.ok === true) return { ok: true, value: record.value as T }
    return { ok: false, error: (record.error as PanelError | undefined) ?? TRANSPORT_ERROR }
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
}

/** Typed panel operations over the wire. */
export class PanelApi {
  // ── filesystem ──────────────────────────────────────────────────────────
  list(root: string, path: string): Promise<PanelEnvelope<DirListing>> {
    return post('/workbench/list', { root, path })
  }
  read(root: string, path: string, asImage: boolean): Promise<PanelEnvelope<FileRead>> {
    return post('/workbench/read', { root, path, asImage })
  }
  write(root: string, path: string, content: string, baseMtime?: number): Promise<PanelEnvelope<{ mtime: number }>> {
    return post('/workbench/write', { root, path, content, baseMtime })
  }
  search(root: string, query: string): Promise<PanelEnvelope<SearchView>> {
    return post('/workbench/search', { root, query })
  }
  delete(root: string, path: string): Promise<PanelEnvelope<{ ok: true }>> {
    return post('/workbench/delete', { root, path })
  }

  // ── git: status / changes / diff ────────────────────────────────────────
  gitStatus(root: string): Promise<PanelEnvelope<GitStatusView | null>> {
    return post('/git/status', { root })
  }
  gitDiff(root: string, path: string, staged: boolean): Promise<PanelEnvelope<{ content: string }>> {
    return post('/git/diff', { root, path, staged })
  }
  gitStage(root: string, paths: string[]): Promise<PanelEnvelope<GitBatchResult>> {
    return post('/git/stage', { root, paths })
  }
  gitUnstage(root: string, paths: string[]): Promise<PanelEnvelope<GitBatchResult>> {
    return post('/git/unstage', { root, paths })
  }
  gitDiscard(root: string, paths: string[]): Promise<PanelEnvelope<GitBatchResult>> {
    return post('/git/discard', { root, paths })
  }

  // ── git: branches / graph / commit / sync ───────────────────────────────
  branches(root: string): Promise<PanelEnvelope<BranchesView | null>> {
    return post('/git/branches', { root })
  }
  switchBranch(root: string, branch: string): Promise<PanelEnvelope<{ branch: string }>> {
    return post('/git/switch', { root, branch })
  }
  createBranch(root: string, name: string): Promise<PanelEnvelope<{ branch: string }>> {
    return post('/git/create-branch', { root, name })
  }
  commit(root: string, message: string): Promise<PanelEnvelope<{ head: string }>> {
    return post('/git/commit', { root, message })
  }
  push(root: string): Promise<PanelEnvelope<{ output: string }>> {
    return post('/git/push', { root })
  }
  pull(root: string): Promise<PanelEnvelope<{ output: string }>> {
    return post('/git/pull', { root })
  }
  graph(root: string, limit?: number): Promise<PanelEnvelope<GraphView | null>> {
    return post('/git/graph', limit === undefined ? { root } : { root, limit })
  }
}

/** One SSE change event pushed by the host. */
export type PanelChangeEvent =
  | { kind: 'fs' }
  | { kind: 'git'; status: GitStatusView }
  | { kind: 'gitUnavailable' }

/**
 * Subscribe to host-pushed changes for one project root (fs watch events and
 * git status polls). Reconnects are handled by the EventSource; the caller
 * re-subscribes when the root changes.
 */
export function subscribePanelEvents(root: string, onChange: (event: PanelChangeEvent) => void): () => void {
  const source = new EventSource(`/workbench/events?root=${encodeURIComponent(root)}`)
  source.addEventListener('change', (raw) => {
    try {
      const event = JSON.parse((raw as MessageEvent).data as string) as PanelChangeEvent
      onChange(event)
    } catch {
      // malformed push; ignore
    }
  })
  return () => { source.close() }
}
