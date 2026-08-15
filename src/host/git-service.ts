/**
 * Unified host git service: one workspace-scoped service for the whole
 * workbench — working-tree status (porcelain v1, -z, with change rows AND
 * branch/head/counts), stage/unstage/discard batches, branch switch/create,
 * commit, push/pull, and the topo-ordered graph. Merged from dsh-web-ui's
 * dsh-aionui-panel + dsh-git-graph (BSD-3-Clause); the two services are folded
 * into one so the host runs a single gate, a single repo cache, and a single
 * operation-marker probe (1 combined spawn, not 7 sequential).
 * @module dsh-workbench/host/git-service
 */

import { existsSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import {
  checkRefFormatArgv, classifySwitchFailure, classifySyncFailure, commitArgv,
  createBranchArgv, forEachRefArgv, gitPathArgv, graphLogArgv, headBranchArgv,
  headShortArgv, OPERATION_MARKERS, operationMarkersArgv, pullArgv, pushArgv,
  statusPorcelainZArgv, switchArgv, topLevelArgv, unmergedArgv, upstreamArgv, validateBranchName,
  verifyRefArgv, worktreeListArgv,
} from '../core/git-command.ts'
import {
  parseBranches, parseGraph, parseWorktreeBranches,
  type BranchesView, type CommitResult, type GitBatchResult, type GitChangeRow,
  type GitFileState, type GitStatusView, type GraphView, type PanelError, type SwitchResult, type SyncResult,
} from '../core/types.ts'
import { isPathInside, type WorkspaceGate } from './gate.ts'

/** One finished git invocation. */
export interface GitRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

/** The spawn seam the service runs git through (subprocess service in production). */
export interface GitRunner {
  run(argv: readonly string[], cwd: string): Promise<GitRunResult>
}

/** Collected-output cap for one git command. */
const OUTPUT_CAP_BYTES = 1 << 20

/** TTL for a positive repo-top-level verdict. */
const REPO_CACHE_TTL_MS = 60_000
/** TTL for a negative (null) repo-top-level verdict. */
const NO_REPO_CACHE_TTL_MS = 30_000

/** Build the argv for one git invocation, with the win32 binary variant. */
export function gitSpawnArgv(platform: NodeJS.Platform, argv: readonly string[]): readonly string[] {
  return platform === 'win32' ? ['git.exe', ...argv] : ['git', ...argv]
}

/** Production runner over `ctx.subprocess`: one managed child per command. */
export function subprocessRunner(ctx: Context): GitRunner {
  return {
    async run(argv, cwd) {
      const spec: SubprocessSpawnSpec = {
        argv: gitSpawnArgv(process.platform, argv),
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: OUTPUT_CAP_BYTES },
          stderr: { maxBytes: OUTPUT_CAP_BYTES },
        },
        graceMs: 10_000,
      }
      let handle: SubprocessHandle
      try {
        handle = ctx.subprocess.spawn(spec)
      } catch (error) {
        console.error('[dsh-workbench] git spawn failed:', error)
        return {
          exitCode: 127,
          stdout: '',
          stderr: 'git: spawn failed: ' + (error instanceof Error ? error.message : String(error)),
        }
      }
      try {
        const outcome = await handle.done
        const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
        const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
        return { exitCode: outcome.exitCode, stdout, stderr }
      } catch (error) {
        console.error('[dsh-workbench] git run failed:', error)
        return {
          exitCode: 127,
          stdout: '',
          stderr: 'git: run failed: ' + (error instanceof Error ? error.message : String(error)),
        }
      }
    },
  }
}

/** HEAD is the symbolic value `git rev-parse --abbrev-ref HEAD` prints when detached. */
const DETACHED = 'HEAD'

/** Map one porcelain letter to the row state (unknown letters stay unknown). */
export function porcelainState(letter: string): GitFileState {
  switch (letter) {
    case 'A': return 'created'
    case 'M': return 'modified'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'created'
    case 'U': return 'conflicted'
    case '?': return 'untracked'
    default: return 'unknown'
  }
}

/**
 * Parse `git status --porcelain=v1 -z` output into staged/unstaged/untracked
 * rows. With -z every entry is NUL-terminated; rename entries carry two paths.
 */
export function parsePorcelain(output: string): {
  staged: GitChangeRow[]
  unstaged: GitChangeRow[]
  untracked: GitChangeRow[]
} {
  const staged: GitChangeRow[] = []
  const unstaged: GitChangeRow[] = []
  const untracked: GitChangeRow[] = []
  if (output === '') return { staged, unstaged, untracked }
  const fields = output.split('\0')
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]
    if (field === '') continue
    const x = field[0] ?? ' '
    const y = field[1] ?? ' '
    const path = field.slice(3)
    if (x === '?' && y === '?') {
      untracked.push({ path, state: 'untracked', staged: false })
      continue
    }
    if (x === 'R' || x === 'C') {
      const oldPath = path
      const newPath = fields[i + 1] ?? oldPath
      i += 1
      staged.push({ path: newPath, oldPath, state: porcelainState(x), staged: true })
      if (y !== ' ') {
        unstaged.push({ path: newPath, oldPath, state: porcelainState(y), staged: false })
      }
      continue
    }
    if (x !== ' ') {
      staged.push({ path, state: porcelainState(x), staged: true })
    }
    if (y !== ' ') {
      unstaged.push({ path, state: porcelainState(y), staged: false })
    }
  }
  return { staged, unstaged, untracked }
}

/** Unique-path summary of the change rows (dirty/untracked/conflict counts). */
export function summarizeChanges(
  staged: GitChangeRow[],
  unstaged: GitChangeRow[],
  untracked: GitChangeRow[],
): { dirtyFiles: number; untrackedFiles: number; conflicts: number } {
  const seen = new Set<string>()
  let dirtyFiles = 0
  let conflicts = 0
  for (const row of [...staged, ...unstaged]) {
    if (seen.has(row.path)) continue
    seen.add(row.path)
    if (row.state === 'conflicted') conflicts += 1
    else dirtyFiles += 1
  }
  return { dirtyFiles, untrackedFiles: untracked.length, conflicts }
}

/** The not-a-repository verdict for status reads. */
const NO_REPO: PanelError = { code: 'git-unavailable', message: 'not a git repository' }
/** The not-a-repository verdict for mutations. */
const NO_REPO_MUTATION: PanelError = { code: 'not-a-repository', message: 'not a git repository' }
/** Rejection for a path outside the workspace registry. */
const WORKSPACE_UNKNOWN: PanelError = { code: 'workspace-unknown', message: 'path is not a registered workspace' }

/**
 * Workspace-scoped git operations. Gated methods pass the gate, resolve the
 * repository root, and reject non-repositories with a stable error; the
 * `Canonical` variants trust an already-gated canonical root (the SSE poll).
 */
export class GitService {
  constructor(
    private readonly runner: GitRunner,
    private readonly gate: WorkspaceGate,
    private readonly fsDelete: (root: string, rel: string) => Promise<{ ok: true } | PanelError>,
  ) {}

  /** Cached one-shot git binary probe. */
  private availablePromise: Promise<boolean> | undefined

  /** Cached repo-top-level resolution per canonical workspace, with a TTL. */
  private readonly repoCache = new Map<string, { value: Promise<string | null>; expiresAt: number }>()

  /** Probe the git binary once (git --version) and cache the verdict. */
  gitAvailable(): Promise<boolean> {
    if (this.availablePromise === undefined) {
      this.availablePromise = this.runner
        .run(['--version'], '/')
        .then((result) => result.exitCode === 0)
        .catch(() => false)
    }
    return this.availablePromise
  }

  /** Resolve the repo top-level for one canonical root (TTL-cached). */
  private repoOf(root: string): Promise<string | null> {
    const now = Date.now()
    const cached = this.repoCache.get(root)
    if (cached !== undefined && cached.expiresAt > now) return cached.value
    const entry: { value: Promise<string | null>; expiresAt: number } = {
      value: Promise.resolve(null),
      expiresAt: Number.POSITIVE_INFINITY,
    }
    entry.value = this.run(topLevelArgv(), root)
      .then((result) => {
        if (result.exitCode === 127) {
          if (this.repoCache.get(root) === entry) this.repoCache.delete(root)
          return null
        }
        if (result.exitCode !== 0) {
          entry.expiresAt = now + NO_REPO_CACHE_TTL_MS
          return null
        }
        const repo = result.stdout.trim()
        const found = repo !== '' && isPathInside(repo, root) ? repo : null
        entry.expiresAt = now + (found === null ? NO_REPO_CACHE_TTL_MS : REPO_CACHE_TTL_MS)
        return found
      })
      .catch(() => {
        entry.expiresAt = now + NO_REPO_CACHE_TTL_MS
        return null
      })
    this.repoCache.set(root, entry)
    return entry.value
  }

  /** Whether an already-gated canonical root is a git repository. */
  isRepositoryCanonical(canonicalRoot: string): Promise<boolean> {
    return this.repoOf(canonicalRoot).then((repo) => repo !== null)
  }

  /** Resolve the gated canonical root and the repository top-level (status reads). */
  private async repo(root: string): Promise<{ ok: true; root: string; repo: string } | { ok: false; error: PanelError }> {
    const gated = await this.gate(root)
    if (!gated.ok) return { ok: false, error: gated.error }
    const repo = await this.repoOf(gated.canonical)
    if (repo === null) return { ok: false, error: NO_REPO }
    return { ok: true, root: gated.canonical, repo }
  }

  /** Resolve for mutations (a non-repo maps to `not-a-repository`, not `git-unavailable`). */
  private async repoMutation(root: string): Promise<{ ok: true; root: string; repo: string } | { ok: false; error: PanelError }> {
    const gated = await this.gate(root)
    if (!gated.ok) return { ok: false, error: gated.error.code === 'workspace-unknown' ? WORKSPACE_UNKNOWN : gated.error }
    const repo = await this.repoOf(gated.canonical)
    if (repo === null) return { ok: false, error: NO_REPO_MUTATION }
    return { ok: true, root: gated.canonical, repo }
  }

  /** Run one git invocation and classify failures. */
  private async run(argv: readonly string[], cwd: string): Promise<GitRunResult> {
    return this.runner.run(argv, cwd)
  }

  /** Whether any git operation marker is present in the repository (1 combined spawn). */
  private async operationInProgress(root: string): Promise<boolean> {
    const resolved = await this.runner.run(operationMarkersArgv(), root)
    if (resolved.exitCode === 0) {
      const markerPaths = resolved.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
      return markerPaths.some((markerPath) => existsSync(resolve(root, markerPath)))
    }
    let inProgress = false
    for (const marker of OPERATION_MARKERS) {
      const single = await this.runner.run(gitPathArgv(marker), root)
      const markerPath = single.stdout.trim()
      if (markerPath !== '' && existsSync(resolve(root, markerPath))) inProgress = true
    }
    return inProgress
  }

  /** The unified status view; null when the root is not a repository. */
  async status(root: string): Promise<GitStatusView | null | PanelError> {
    if (!(await this.gitAvailable())) return null
    const repo = await this.repo(root)
    if (!repo.ok) return repo.error.code === 'git-unavailable' ? null : repo.error
    return this.statusAt(repo.root, repo.repo)
  }

  /** The unified status view for an already-gated canonical root (SSE poll). */
  async statusCanonical(canonicalRoot: string): Promise<GitStatusView | null> {
    const repo = await this.repoOf(canonicalRoot)
    if (repo === null) return null
    return this.statusAt(canonicalRoot, repo)
  }

  /** Run branch + head + porcelain status for one resolved repo and parse the merged view. */
  private async statusAt(root: string, repo: string): Promise<GitStatusView> {
    const [branchResult, headResult, statusResult] = await Promise.all([
      this.run(headBranchArgv(), repo),
      this.run(headShortArgv(), repo),
      this.run(statusPorcelainZArgv(), repo),
    ])
    const branch = branchResult.stdout.trim() === DETACHED ? '' : branchResult.stdout.trim()
    const { staged, unstaged, untracked } = parsePorcelain(statusResult.stdout)
    const counts = summarizeChanges(staged, unstaged, untracked)
    return {
      root,
      branch,
      head: headResult.stdout.trim(),
      staged,
      unstaged,
      untracked,
      ...counts,
      operationInProgress: await this.operationInProgress(repo),
    }
  }

  /** Local branch list with the current branch marked. */
  async branches(root: string): Promise<BranchesView | null | PanelError> {
    const repo = await this.repo(root)
    if (!repo.ok) return repo.error.code === 'git-unavailable' ? null : repo.error
    return this.branchesAt(repo.repo, repo.root)
  }

  /** Branch list for an already-resolved repo. */
  private async branchesAt(repo: string, root: string): Promise<BranchesView> {
    const [refs, branchResult, statusResult] = await Promise.all([
      this.run(forEachRefArgv(), repo),
      this.run(headBranchArgv(), repo),
      this.run(statusPorcelainZArgv(), repo),
    ])
    const current = branchResult.stdout.trim()
    const { staged, unstaged, untracked } = parsePorcelain(statusResult.stdout)
    const counts = summarizeChanges(staged, unstaged, untracked)
    return {
      root,
      branch: current === DETACHED ? '' : current,
      branches: parseBranches(refs.stdout),
      ...counts,
      operationInProgress: await this.operationInProgress(repo),
    }
  }

  /** Topo-ordered commit graph across branches/tags/remotes (read-only). */
  async graph(root: string, limit = 200): Promise<GraphView | null | PanelError> {
    const repo = await this.repo(root)
    if (!repo.ok) return repo.error.code === 'git-unavailable' ? null : repo.error
    const [logResult, branchResult] = await Promise.all([
      this.run(graphLogArgv(limit + 1), repo.repo),
      this.run(headBranchArgv(), repo.repo),
    ])
    const commits = parseGraph(logResult.stdout)
    const hasMore = commits.length > limit
    const branch = branchResult.stdout.trim()
    return {
      root: repo.root,
      branch: branch === DETACHED ? '' : branch,
      commits: hasMore ? commits.slice(0, limit) : commits,
      hasMore,
    }
  }

  /** Workspace-level `git switch --no-guess <branch>` with guards. */
  async switchBranch(root: string, branch: string): Promise<SwitchResult> {
    const repo = await this.repoMutation(root)
    if (!repo.ok) return { ok: false, error: repo.error }
    const formatted = await this.run(checkRefFormatArgv(branch), repo.repo)
    if (formatted.exitCode !== 0) {
      return { ok: false, error: { code: 'invalid-branch-name', message: formatted.stderr.trim() || 'invalid branch name' } }
    }
    const verified = await this.run(verifyRefArgv(branch), repo.repo)
    if (verified.exitCode !== 0) {
      return { ok: false, error: { code: 'target-branch-not-found', message: `branch "${branch}" does not exist locally` } }
    }
    const currentResult = await this.run(headBranchArgv(), repo.repo)
    const current = currentResult.stdout.trim()
    if (current === branch) return { ok: true, branch }
    const blocked = await this.guardBlock(repo.repo, branch)
    if (blocked !== null) return { ok: false, error: blocked }
    const switched = await this.run(switchArgv(branch), repo.repo)
    if (switched.exitCode === 0) return { ok: true, branch }
    return { ok: false, error: classifySwitchFailure(switched.stderr) }
  }

  /** Create a branch from the current HEAD and switch to it. */
  async createBranch(root: string, name: string): Promise<SwitchResult> {
    const mirrorReason = validateBranchName(name)
    if (mirrorReason !== null) {
      return { ok: false, error: { code: 'invalid-branch-name', message: `invalid branch name: ${mirrorReason}` } }
    }
    const repo = await this.repoMutation(root)
    if (!repo.ok) return { ok: false, error: repo.error }
    const formatted = await this.run(checkRefFormatArgv(name), repo.repo)
    if (formatted.exitCode !== 0) {
      return { ok: false, error: { code: 'invalid-branch-name', message: formatted.stderr.trim() || 'invalid branch name' } }
    }
    const refs = await this.run(forEachRefArgv(), repo.repo)
    if (parseBranches(refs.stdout).some(row => row.name === name)) {
      return { ok: false, error: { code: 'branch-already-exists', message: `branch "${name}" already exists` } }
    }
    const blocked = await this.guardBlock(repo.repo, undefined)
    if (blocked !== null) return { ok: false, error: blocked }
    const created = await this.run(createBranchArgv(name), repo.repo)
    if (created.exitCode === 0) return { ok: true, branch: name }
    return { ok: false, error: classifySwitchFailure(created.stderr) }
  }

  /** Commit the staged index with a message. */
  async commit(root: string, message: string): Promise<CommitResult> {
    const trimmed = message.trim()
    if (trimmed === '') {
      return { ok: false, error: { code: 'commit-failed', message: 'empty commit message' } }
    }
    const repo = await this.repoMutation(root)
    if (!repo.ok) return { ok: false, error: repo.error }
    // A rebase/merge/cherry-pick in progress means `git commit` would act on the
    // wrong state; surface the guard instead of letting a half-baked commit through.
    if (await this.operationInProgress(repo.repo)) {
      return { ok: false, error: { code: 'operation-in-progress', message: 'a git operation is in progress' } }
    }
    const result = await this.run(commitArgv(trimmed), repo.repo)
    if (result.exitCode === 0) {
      const head = await this.run(headShortArgv(), repo.repo)
      return { ok: true, head: head.stdout.trim() }
    }
    return { ok: false, error: classifySyncFailure('commit', result.stderr) }
  }

  /** `git push` the current branch to its upstream (phase 2 — auth is host-side). */
  async push(root: string): Promise<SyncResult> {
    const repo = await this.repoMutation(root)
    if (!repo.ok) return { ok: false, error: repo.error }
    if (!(await this.hasUpstream(repo.repo))) {
      return { ok: false, error: { code: 'no-upstream', message: 'no upstream branch; run `git push -u origin <branch>` first' } }
    }
    const result = await this.run(pushArgv(), repo.repo)
    if (result.exitCode === 0) return { ok: true, output: result.stdout + result.stderr }
    return { ok: false, error: classifySyncFailure('push', result.stderr) }
  }

  /** `git pull --ff-only` (phase 2 — conflict/auth handling is host-side). */
  async pull(root: string): Promise<SyncResult> {
    const repo = await this.repoMutation(root)
    if (!repo.ok) return { ok: false, error: repo.error }
    if (!(await this.hasUpstream(repo.repo))) {
      return { ok: false, error: { code: 'no-upstream', message: 'no upstream branch; run `git push -u origin <branch>` first' } }
    }
    const result = await this.run(pullArgv(), repo.repo)
    if (result.exitCode === 0) return { ok: true, output: result.stdout + result.stderr }
    return { ok: false, error: classifySyncFailure('pull', result.stderr) }
  }

  /** Whether the current branch tracks an upstream (rev-parse @{upstream}). */
  private async hasUpstream(repo: string): Promise<boolean> {
    const result = await this.run(upstreamArgv(), repo)
    return result.exitCode === 0
  }

  /** The pre-switch guards (conflicts, in-progress ops, other-worktree checkout). */
  private async guardBlock(root: string, target: string | undefined): Promise<PanelError | null> {
    const [conflicts, inProgress, worktrees] = await Promise.all([
      this.run(unmergedArgv(), root),
      this.operationInProgress(root),
      target === undefined ? Promise.resolve(null) : this.run(worktreeListArgv(), root),
    ])
    const conflictCount = conflicts.stdout.split('\n').filter(line => line !== '').length
    if (conflictCount > 0) {
      return { code: 'conflicts-present', message: `repository has ${conflictCount} unresolved conflict(s)` }
    }
    if (inProgress) {
      return { code: 'operation-in-progress', message: 'a git operation is in progress' }
    }
    if (target !== undefined && worktrees !== null && parseWorktreeBranches(worktrees.stdout).includes(target)) {
      return { code: 'branch-in-other-worktree', message: `branch "${target}" is checked out in another worktree` }
    }
    return null
  }

  /** The unified diff of one path ('' when there is no diff to show). */
  async diff(root: string, path: string, staged: boolean): Promise<{ content: string } | PanelError> {
    const repo = await this.repo(root)
    if (!repo.ok) return repo.error
    const abs = join(repo.repo, path)
    if (!isPathInside(repo.repo, abs)) return { code: 'path-outside-root', message: 'path outside the repository' }
    const rel = relative(repo.repo, abs)
    const tracked = await this.run(['ls-files', '--error-unmatch', '--', rel], repo.repo)
    const result = tracked.exitCode !== 0
      ? await this.run(['diff', '--no-index', '--', '/dev/null', rel], repo.repo)
      : staged
        ? await this.run(['diff', '--cached', '--', rel], repo.repo)
        : await this.run(['diff', '--', rel], repo.repo)
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      return { code: 'git-failed', message: 'git diff failed' }
    }
    return { content: result.stdout }
  }

  /** Verify paths stay inside the repo root (defense in depth). */
  private pathsInside(repo: string, paths: string[]): string[] {
    const abs = paths.map((p) => join(repo, p))
    return abs.filter((p) => isPathInside(repo, p)).map((p) => p)
  }

  /** Stage paths (git add). */
  async stage(root: string, paths: string[]): Promise<GitBatchResult | PanelError> {
    return this.batch(root, paths, async (repo, inside) => {
      const result = await this.run(['add', '--', ...inside], repo)
      return result.exitCode === 0
    })
  }

  /** Unstage paths (git restore --staged). */
  async unstage(root: string, paths: string[]): Promise<GitBatchResult | PanelError> {
    return this.batch(root, paths, async (repo, inside) => {
      const result = await this.run(['restore', '--staged', '--', ...inside], repo)
      return result.exitCode === 0
    })
  }

  /** Discard paths (worktree side only; untracked paths are deleted). */
  async discard(root: string, paths: string[]): Promise<GitBatchResult | PanelError> {
    const repo = await this.repo(root)
    if (!repo.ok) return repo.error
    const inside = this.pathsInside(repo.repo, paths)
    const applied: string[] = []
    const failed: string[] = []
    for (const p of paths) {
      const abs = join(repo.repo, p)
      if (!inside.includes(abs)) {
        failed.push(p)
        continue
      }
      const untrackedResult = await this.run(['ls-files', '--error-unmatch', '--', ':(literal)' + p], repo.repo)
      if (untrackedResult.exitCode !== 0) {
        try {
          const real = await realpath(join(repo.repo, p))
          if (!isPathInside(repo.repo, real)) {
            failed.push(p)
            continue
          }
        } catch {
          // path does not exist on disk: nothing to escape
        }
        const rel = relative(repo.root, join(repo.repo, p))
        if (rel === '..' || rel.startsWith('../')) {
          failed.push(p)
          continue
        }
        const deleted = await this.fsDelete(repo.root, rel)
        if ('ok' in deleted && deleted.ok) applied.push(p)
        else failed.push(p)
        continue
      }
      const result = await this.run(['restore', '--worktree', '--', ':(literal)' + p], repo.repo)
      if (result.exitCode === 0) applied.push(p)
      else failed.push(p)
    }
    return { applied, failed }
  }

  /** Shared batch plumbing: gate, repo resolve, path filter, run the op. */
  private async batch(
    root: string,
    paths: string[],
    op: (repo: string, inside: string[]) => Promise<boolean>,
  ): Promise<GitBatchResult | PanelError> {
    const repo = await this.repo(root)
    if (!repo.ok) return repo.error
    const inside = this.pathsInside(repo.repo, paths)
    const ok = inside.length > 0 ? await op(repo.repo, inside) : true
    if (!ok) return { code: 'git-failed', message: 'git operation failed' }
    const applied = ok ? paths.filter((p) => inside.includes(join(repo.repo, p))) : []
    const failed = paths.filter((p) => !inside.includes(join(repo.repo, p)))
    return { applied, failed }
  }
}
