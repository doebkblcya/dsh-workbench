/**
 * Wire vocabulary shared by the host data services and the browser client:
 * the request/response shapes of the /workbench/* (fs) and /git/* (git) routes
 * and the stable error codes the client maps onto copy. Pure types + parsers
 * (no runtime code beyond the parsing/narrowing helpers).
 *
 * Merged from dsh-web-ui's dsh-aionui-panel and dsh-git-graph (BSD-3-Clause):
 * one status view now carries both the change rows (SCM) and the branch/head/
 * counts (branch selector + commit box), and the switch/create/commit/push/pull
 * error vocabulary is folded into the single PanelError union.
 * @module dsh-workbench/core/types
 */

/** Envelope every JSON response carries. */
export type PanelEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: PanelError }

/** Stable rejection codes (host-authored; the client prefers its own copy by code). */
export type PanelErrorCode =
  // fs + baseline git (aionui-panel vocabulary)
  | 'workspace-unknown'
  | 'path-outside-root'
  | 'not-found'
  | 'is-directory'
  | 'read-failed'
  | 'write-conflict'
  | 'write-failed'
  | 'search-failed'
  | 'git-unavailable'
  | 'git-failed'
  | 'internal'
  // branch switch/create guards (git-graph vocabulary)
  | 'conflicts-present'
  | 'operation-in-progress'
  | 'branch-in-other-worktree'
  | 'tracked-changes-would-be-overwritten'
  | 'untracked-changes-would-be-overwritten'
  | 'target-branch-not-found'
  | 'invalid-branch-name'
  | 'branch-already-exists'
  // commit / push / pull
  | 'nothing-to-commit'
  | 'commit-failed'
  | 'not-a-repository'
  | 'auth-required'
  | 'sync-rejected'
  | 'git-identity-unconfigured'
  | 'no-upstream'

/** One rejection with a human-readable host message. */
export interface PanelError {
  code: PanelErrorCode
  message: string
  /** Files blocking the operation (overwrite guards), first few only. */
  paths?: string[]
  /** Additional blocked-file count beyond `paths`. */
  moreFiles?: number
}

/** One filesystem entry in a directory listing (path is relative to the root). */
export interface FsEntry {
  /** Display name (basename). */
  name: string
  /** Path relative to the project root, '/' separated; '' is the root itself. */
  path: string
  isDir: boolean
  /** Size in bytes (0 for directories). */
  size: number
  /** Last-modified epoch millis (0 for directories). */
  mtime: number
}

/** The listing of one directory. */
export interface DirListing {
  /** Canonical root path the listing is relative to. */
  root: string
  /** Sorted entries (directories first, then files, both case-insensitive alpha). */
  entries: FsEntry[]
}

/** The result of reading one file for preview. */
export interface FileRead {
  /** Text content (decoded utf-8), or a data URL for image kinds. */
  content: string
  /** True when the text was truncated at the preview ceiling. */
  truncated: boolean
  /** Total size in bytes. */
  size: number
  /** Last-modified epoch millis (the write-conflict base). */
  mtime: number
  /** Image dimensions when the file is an image (host decodes via probe). */
  image?: { width: number; height: number }
}

/** One filename-search hit. */
export interface SearchHit {
  /** Path relative to the root. */
  path: string
  /** Display name (basename). */
  name: string
  isDir: boolean
}

/** The filename-search result. */
export interface SearchView {
  /** The query the hits were ranked for. */
  query: string
  hits: SearchHit[]
  /** True when the hit cap cut the result stream. */
  truncated: boolean
}

/** Working-tree state of one change row. */
export type GitFileState = 'created' | 'modified' | 'deleted' | 'renamed' | 'conflicted' | 'untracked' | 'unknown'

/** One change row in a git status. */
export interface GitChangeRow {
  /** Path relative to the repo root. */
  path: string
  /** Original path for renames (old -> new). */
  oldPath?: string
  state: GitFileState
  /** True when the change sits in the index (staged). */
  staged: boolean
}

/**
 * The unified git status view of one repo root: the change rows (SCM panel)
 * plus the branch/head/counts (branch selector + commit box).
 */
export interface GitStatusView {
  /** Repo root (git rev-parse --show-toplevel). */
  root: string
  /** Current branch name; '' when detached. */
  branch: string
  /** Short head commit id (first 7 hex chars). */
  head: string
  /** Staged changes (index vs HEAD). */
  staged: GitChangeRow[]
  /** Unstaged changes (worktree vs index). */
  unstaged: GitChangeRow[]
  /** Untracked files (worktree, not in index). */
  untracked: GitChangeRow[]
  /** Tracked modification/deletion/creation rows (staged + unstaged). */
  dirtyFiles: number
  /** Untracked file count. */
  untrackedFiles: number
  /** Unresolved merge-conflict entry count. */
  conflicts: number
  /** Whether a merge/rebase/cherry-pick/revert/bisect is in progress. */
  operationInProgress: boolean
}

/** The result of a stage/unstage/discard batch. */
export interface GitBatchResult {
  /** Rows the operation actually changed (post-op status snapshot for these paths). */
  applied: string[]
  /** Paths the host refused to touch. */
  failed: string[]
}

/** One local branch row (git for-each-ref refs/heads). */
export interface BranchRow {
  name: string
  current: boolean
}

/** The branch-list view (git for-each-ref refs/heads + worktree dirtiness). */
export interface BranchesView {
  root: string
  /** Current branch name; empty when detached. */
  branch: string
  branches: BranchRow[]
  dirtyFiles: number
  untrackedFiles: number
  conflicts: number
  operationInProgress: boolean
}

/** Outcome of one switch/create attempt. */
export type SwitchResult =
  | { ok: true; branch: string }
  | { ok: false; error: PanelError }

/** Outcome of one commit attempt. */
export type CommitResult =
  | { ok: true; head: string }
  | { ok: false; error: PanelError }

/** Outcome of one push/pull attempt (output kept for the sync log). */
export type SyncResult =
  | { ok: true; output: string }
  | { ok: false; error: PanelError }

/** One graph row (git log --topo-order with parents and decorations). */
export interface GraphCommit {
  oid: string
  parents: string[]
  subject: string
  author: string
  /** Unix epoch seconds (git %at). */
  authorTime: number
  /** Decoration ref names (branches/tags/HEAD), stripped of prefixes. */
  refs: string[]
}

/** The Git graph view. */
export interface GraphView {
  root: string
  branch: string
  commits: GraphCommit[]
  hasMore: boolean
}

/** One preview tab identity as persisted. */
export interface PreviewTabMeta {
  /** Stable tab id (root + path + type). */
  id: string
  /** Display title (basename). */
  title: string
  /** Project root the file belongs to. */
  root: string
  /** File path relative to the root. */
  path: string
  contentType: PreviewContentType
  /** Whether the tab carries unsaved edits. */
  dirty?: boolean
  /** Last write timestamp the tab's content was based on (conflict base). */
  mtime?: number
  /** When the tab was last touched (LRU ordering within a scope). */
  savedAt: number
}

/** Preview content kinds the panel can render. */
export type PreviewContentType =
  | 'markdown'
  | 'html'
  | 'code'
  | 'diff'
  | 'csv'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'image'
  | 'text'
  | 'url'
  | 'unsupported'

// ─── parsers (pure, shared by host + client) ───────────────────────────────

/** Parse output of `git for-each-ref refs/heads --format=...`. */
export function parseBranches(stdout: string): BranchRow[] {
  const rows: BranchRow[] = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const [name, head, oid] = line.split('\u0000')
    if (name === undefined || head === undefined || oid === undefined) continue
    rows.push({ name, current: head === '*' })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

/** Parse `git worktree list --porcelain` into the branch refs checked out. */
export function parseWorktreeBranches(stdout: string): string[] {
  const branches: string[] = []
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('branch refs/heads/')) continue
    const name = line.slice('branch refs/heads/'.length).trim()
    if (name !== '' && !branches.includes(name)) branches.push(name)
  }
  return branches
}

/** Parse the graph format rows (`%H %P %an %at %D %s` split by \x1e). */
export function parseGraph(stdout: string): GraphCommit[] {
  const commits: GraphCommit[] = []
  for (const raw of stdout.split('\u001e')) {
    const entry = raw.replace(/^\n/, '')
    if (entry === '') continue
    const [oid, parentsRaw, author, authorTimeRaw, decoration, subject] = entry.split('\u0000')
    if (oid === undefined || oid === '') continue
    commits.push({
      oid,
      parents: parentsRaw === undefined || parentsRaw === '' ? [] : parentsRaw.split(' '),
      subject: subject ?? '',
      author: author ?? '',
      authorTime: Number(authorTimeRaw ?? '0'),
      refs: parseDecoration(decoration ?? ''),
    })
  }
  return commits
}

/** Decoration → ref names: drop the `HEAD -> ` handoff prefix and `tag: `. */
export function parseDecoration(decoration: string): string[] {
  if (decoration === '') return []
  return decoration.split(', ').map(part => {
    let name = part.replace(/^HEAD -> /, '').replace(/^HEAD,? ?/, '')
    name = name.replace(/^tag: /, '')
    return name.trim()
  }).filter(name => name !== '')
}

/** One rendered graph lane column. */
export type LaneGlyph = 'node' | 'pass' | 'merge' | 'gap'

/** A row's lane map: one glyph per lane column, left to right. */
export interface GraphRowLanes {
  /** Column glyphs; the node sits at `nodeColumn`. */
  columns: LaneGlyph[]
  nodeColumn: number
  /** Whether this commit is a merge (≥2 parents). */
  merge: boolean
}

/** Minimal lane assignment over topo-ordered rows. */
export function computeLanes(rows: readonly GraphCommit[]): GraphRowLanes[] {
  const later = new Set<string>()
  for (const row of rows) {
    for (const parent of row.parents) later.add(parent)
  }
  const lanes: (string | null)[] = []
  const result: GraphRowLanes[] = []
  for (const row of rows) {
    let nodeColumn = lanes.findIndex(pending => pending === row.oid)
    if (nodeColumn === -1) {
      lanes.push(row.oid)
      nodeColumn = lanes.length - 1
    }
    const columns: LaneGlyph[] = []
    for (let i = 0; i < lanes.length; i += 1) {
      const pending = lanes[i]
      if (pending === null) columns.push('gap')
      else if (i === nodeColumn) columns.push(row.parents.length > 1 ? 'merge' : 'node')
      else if (pending === row.oid) columns.push('gap')
      else if (typeof pending === 'string' && later.has(pending)) columns.push('pass')
      else columns.push('gap')
    }
    const parents = row.parents.filter(parent => later.has(parent))
    const [first, ...rest] = parents
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i] === row.oid && i !== nodeColumn) lanes[i] = null
    }
    lanes[nodeColumn] = first ?? null
    for (const parent of rest) {
      if (!lanes.includes(parent)) lanes.push(parent)
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    result.push({ columns, nodeColumn, merge: row.parents.length > 1 })
  }
  return result
}

// ─── runtime narrowing (route boundary) ─────────────────────────────────────

/** The set of stable {@link PanelErrorCode} members. */
const ERROR_CODES = new Set<PanelErrorCode>([
  'workspace-unknown', 'path-outside-root', 'not-found', 'is-directory',
  'read-failed', 'write-conflict', 'write-failed', 'search-failed',
  'git-unavailable', 'git-failed', 'internal',
  'conflicts-present', 'operation-in-progress', 'branch-in-other-worktree',
  'tracked-changes-would-be-overwritten', 'untracked-changes-would-be-overwritten',
  'target-branch-not-found', 'invalid-branch-name', 'branch-already-exists',
  'nothing-to-commit', 'commit-failed', 'not-a-repository', 'auth-required', 'sync-rejected',
  'git-identity-unconfigured', 'no-upstream',
])

/** Narrow an unknown value onto {@link PanelError}. */
export function isPanelError(value: unknown): value is PanelError {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.code !== 'string' || !ERROR_CODES.has(record.code as PanelErrorCode)) return false
  if (typeof record.message !== 'string') return false
  if (record.paths !== undefined && (!Array.isArray(record.paths) || !record.paths.every(p => typeof p === 'string'))) return false
  if (record.moreFiles !== undefined && typeof record.moreFiles !== 'number') return false
  return true
}

/** Narrow an unknown value onto {@link GitChangeRow}. */
function isChangeRow(value: unknown): value is GitChangeRow {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.path === 'string'
    && typeof record.state === 'string'
    && typeof record.staged === 'boolean'
}

/** Narrow an unknown value onto {@link GitStatusView}. */
export function isGitStatusView(value: unknown): value is GitStatusView {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.root === 'string'
    && typeof record.branch === 'string'
    && typeof record.head === 'string'
    && Array.isArray(record.staged) && record.staged.every(isChangeRow)
    && Array.isArray(record.unstaged) && record.unstaged.every(isChangeRow)
    && Array.isArray(record.untracked) && record.untracked.every(isChangeRow)
    && typeof record.dirtyFiles === 'number'
    && typeof record.untrackedFiles === 'number'
    && typeof record.conflicts === 'number'
    && typeof record.operationInProgress === 'boolean'
}

/** Narrow an unknown value onto {@link BranchRow}. */
export function isBranchRow(value: unknown): value is BranchRow {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.name === 'string' && typeof record.current === 'boolean'
}

/** Narrow an unknown value onto {@link BranchesView}. */
export function isBranchesView(value: unknown): value is BranchesView {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.root === 'string'
    && typeof record.branch === 'string'
    && Array.isArray(record.branches) && record.branches.every(isBranchRow)
    && typeof record.dirtyFiles === 'number'
    && typeof record.untrackedFiles === 'number'
    && typeof record.conflicts === 'number'
    && typeof record.operationInProgress === 'boolean'
}

/** Narrow an unknown value onto {@link GraphCommit}. */
export function isGraphCommit(value: unknown): value is GraphCommit {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.oid === 'string'
    && Array.isArray(record.parents) && record.parents.every(parent => typeof parent === 'string')
    && typeof record.subject === 'string'
    && typeof record.author === 'string'
    && typeof record.authorTime === 'number'
    && Array.isArray(record.refs) && record.refs.every(ref => typeof ref === 'string')
}

/** Narrow an unknown value onto {@link GraphView}. */
export function isGraphView(value: unknown): value is GraphView {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.root === 'string'
    && typeof record.branch === 'string'
    && Array.isArray(record.commits) && record.commits.every(isGraphCommit)
    && typeof record.hasMore === 'boolean'
}
