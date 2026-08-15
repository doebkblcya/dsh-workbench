/**
 * Git command vocabulary: argv builders, stderr classification, and the pure
 * branch-name validation mirror. The host service runs these through the
 * subprocess seam. Merged from dsh-web-ui's dsh-git-graph (BSD-3-Clause) and
 * extended with commit/push/pull argv.
 * @module dsh-workbench/core/git-command
 */

import type { PanelError, PanelErrorCode } from './types.ts'

/** `git rev-parse --show-toplevel` — canonical repository root. */
export const topLevelArgv = (): string[] => ['rev-parse', '--show-toplevel']

/** `git rev-parse --abbrev-ref HEAD` — current branch ('HEAD' when detached). */
export const headBranchArgv = (): string[] => ['rev-parse', '--abbrev-ref', 'HEAD']

/** `git rev-parse --short HEAD` — short head id. */
export const headShortArgv = (): string[] => ['rev-parse', '--short', 'HEAD']

/** `git for-each-ref refs/heads --format=...` — local branches. */
export const forEachRefArgv = (): string[] => [
  'for-each-ref', 'refs/heads',
  '--format=%(refname:short)%00%(HEAD)%00%(objectname)',
]

/** `git status --porcelain` — worktree dirtiness and conflicts. */
export const statusPorcelainArgv = (): string[] => ['status', '--porcelain']

/** `git status --porcelain=v1 -z --untracked-files=all` — full change rows (NUL-separated). */
export const statusPorcelainZArgv = (): string[] => ['status', '--porcelain=v1', '-z', '--untracked-files=all']

/** `git diff --name-only --diff-filter=U` — unmerged (conflict) files. */
export const unmergedArgv = (): string[] => ['diff', '--name-only', '--diff-filter=U']

/** `git worktree list --porcelain` — all worktrees and their checked-out branches. */
export const worktreeListArgv = (): string[] => ['worktree', 'list', '--porcelain']

/** `git rev-parse --verify --quiet refs/heads/<branch>` — branch existence probe. */
export const verifyRefArgv = (branch: string): string[] => ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]

/** `git check-ref-format --branch <name>` — the authoritative branch-name gate. */
export const checkRefFormatArgv = (name: string): string[] => ['check-ref-format', '--branch', name]

/** `git switch --no-guess -- <branch>` — workspace-level branch switch. */
export const switchArgv = (branch: string): string[] => ['switch', '--no-guess', '--', branch]

/** `git switch --no-guess -c <name>` — create from current HEAD and switch. */
export const createBranchArgv = (name: string): string[] => ['switch', '--no-guess', '-c', name]

/** Graph log: `git log --branches --tags --remotes --topo-order --parents --format=... --max-count <n>`. */
export const graphLogArgv = (limit: number): string[] => [
  'log', '--branches', '--tags', '--remotes', '--topo-order', '--parents',
  '--format=%H%x00%P%x00%an%x00%at%x00%D%x00%s%x1e',
  '--max-count', String(limit),
]

/** `git commit -m <message>` — commit the staged index. */
export const commitArgv = (message: string): string[] => ['commit', '-m', message]

/** `git pull --ff-only` — fast-forward pull (no merge commit, no rebase). */
export const pullArgv = (): string[] => ['pull', '--ff-only']

/** `git push` — push the current branch to its upstream. */
export const pushArgv = (): string[] => ['push']

/** `git rev-parse --abbrev-ref @{upstream}` — the tracked upstream (non-zero when unset). */
export const upstreamArgv = (): string[] => ['rev-parse', '--abbrev-ref', '@{upstream}']

/** Git markers whose presence means an operation is in progress. */
export const OPERATION_MARKERS = [
  'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG',
  'rebase-merge', 'rebase-apply', 'sequencer',
] as const

/** `git rev-parse --git-path <marker>` — resolve ONE operation marker path. */
export const gitPathArgv = (marker: string): string[] => ['rev-parse', '--git-path', marker]

/** `git rev-parse --git-path <marker>...` — resolve every marker path in ONE spawn. */
export const operationMarkersArgv = (): string[] => [
  'rev-parse',
  ...OPERATION_MARKERS.flatMap((marker) => ['--git-path', marker]),
]

/** stderr pattern → overwrite guard code, with the blocked-file extraction. */
interface OverwritePattern {
  code: Extract<PanelErrorCode, 'tracked-changes-would-be-overwritten' | 'untracked-changes-would-be-overwritten'>
  header: RegExp
}

const OVERWRITE_PATTERNS: OverwritePattern[] = [
  {
    code: 'tracked-changes-would-be-overwritten',
    header: /Your local changes to the following files would be overwritten by checkout/,
  },
  {
    code: 'untracked-changes-would-be-overwritten',
    header: /The following untracked working tree files would be overwritten by checkout/,
  },
  {
    code: 'tracked-changes-would-be-overwritten',
    header: /Your local changes to the following files would be overwritten by merge/,
  },
]

/**
 * Extract the blocked-file list following an overwrite header: git indents
 * paths with a tab (quoted when they contain spaces).
 */
export function extractBlockedPaths(
  stderr: string,
  header: RegExp,
): { paths: string[]; moreFiles: number } {
  const start = stderr.indexOf('\n', stderr.search(header))
  if (start === -1) return { paths: [], moreFiles: 0 }
  const paths: string[] = []
  for (const line of stderr.slice(start + 1).split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || !line.startsWith('\t')) break
    const quoted = /^"(.+)"$/.exec(trimmed)
    const path = quoted === null
      ? trimmed.replace(/\\(.)/g, '$1')
      : (quoted[1] ?? '').replace(/\\(.)/g, '$1')
    paths.push(path)
  }
  return { paths: paths.slice(0, 2), moreFiles: Math.max(0, paths.length - 2) }
}

/**
 * Classify a failed switch's stderr onto the stable error vocabulary.
 */
export function classifySwitchFailure(stderr: string): PanelError {
  const head = stderr.trim().split('\n')[0] ?? stderr
  for (const pattern of OVERWRITE_PATTERNS) {
    if (pattern.header.test(stderr)) {
      const { paths, moreFiles } = extractBlockedPaths(stderr, pattern.header)
      return { code: pattern.code, message: head, paths, moreFiles }
    }
  }
  if (/did not match any file\(s\) known to git|invalid reference|not a valid branch/.test(stderr)) {
    return { code: 'target-branch-not-found', message: head }
  }
  if (/already used by worktree|is already checked out at/.test(stderr)) {
    return { code: 'branch-in-other-worktree', message: head }
  }
  if (/local changes to the following files would be overwritten/.test(stderr)) {
    return { code: 'tracked-changes-would-be-overwritten', message: head }
  }
  return { code: 'internal', message: head || 'git switch failed' }
}

/**
 * Classify a failed commit/push/pull onto the stable error vocabulary. The
 * generic fallbacks (`commit-failed` / `sync-rejected`) carry the real git
 * stderr head in `message`, so the client can surface the actual reason
 * instead of a canned sentence.
 */
export function classifySyncFailure(kind: 'commit' | 'push' | 'pull', stderr: string): PanelError {
  const head = stderr.trim().split('\n')[0] ?? stderr
  const lower = stderr.toLowerCase()
  if (kind === 'commit' && /nothing to commit|nothing added to commit|no changes added to commit/.test(lower)) {
    return { code: 'nothing-to-commit', message: head || 'nothing to commit' }
  }
  // git identity not configured (user.name / user.email missing).
  if (/please tell me who you are|unable to auto-detect email address|user\.name|user\.email/.test(lower)) {
    return { code: 'git-identity-unconfigured', message: head || 'git identity is not configured' }
  }
  // No upstream / tracking branch / remote configured.
  if (/no upstream branch|has no upstream|no tracking information|does not appear to be a git repository/.test(lower)) {
    return { code: 'no-upstream', message: head || 'no upstream branch' }
  }
  if (/could not read username|authentication failed|permission denied|terminal prompts disabled|could not read password|invalid username or password|access denied|could not read from remote repository/.test(lower)) {
    return { code: 'auth-required', message: head || 'authentication required' }
  }
  if (/non-fast-forward|fetch first|rejected|would be overwritten|not possible to fast-forward|diverged/.test(lower)) {
    return { code: 'sync-rejected', message: head || 'sync rejected' }
  }
  if (kind === 'commit') return { code: 'commit-failed', message: head || 'git commit failed' }
  return { code: 'sync-rejected', message: head || `git ${kind} failed` }
}

/**
 * Pure mirror of `git check-ref-format --branch` short-name rules, for instant
 * client-side feedback; the host's check-ref-format call stays authoritative.
 */
export function validateBranchName(name: string): string | null {
  if (name === '') return 'empty'
  if (name === '@') return 'at-sign'
  if (name.startsWith('-')) return 'leading-dash'
  if (name.endsWith('.')) return 'trailing-dot'
  if (name.endsWith('.lock')) return 'lock-suffix'
  if (name.includes('..')) return 'double-dot'
  if (name.includes('@{')) return 'at-brace'
  if (name.includes('//')) return 'double-slash'
  if (name.includes(' ')) return 'space'
  if (name.includes('~') || name.includes('^') || name.includes(':')) return 'forbidden-char'
  if (name.includes('?') || name.includes('*') || name.includes('[') || name.includes('\\')) return 'forbidden-char'
  for (const ch of name) {
    const code = ch.codePointAt(0)
    if (code !== undefined && (code < 0x20 || code === 0x7f)) return 'control-char'
  }
  for (const component of name.split('/')) {
    if (component === '') return 'empty-component'
    if (component.startsWith('.')) return 'dot-component'
    if (component.endsWith('.lock')) return 'lock-suffix'
  }
  if (name.length > 1000) return 'too-long'
  return null
}
