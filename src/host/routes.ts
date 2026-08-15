/**
 * Route layer for dsh-workbench: one `/git/*` prefix (JSON git operations),
 * one `/workbench/*` prefix (JSON fs operations + GET /workbench/raw), and one
 * SSE stream (`/workbench/events`) per project root carrying both fs change
 * events and git status changes. The services own gating and parsing; this
 * layer owns HTTP shape and subscriber bookkeeping. Merged from dsh-web-ui's
 * dsh-aionui-panel + dsh-git-graph (BSD-3-Clause).
 * @module dsh-workbench/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  isBranchesView, isGitStatusView, isGraphView, isPanelError,
  type PanelEnvelope, type PanelError,
} from '../core/types.ts'
import type { FsService } from './fs-service.ts'
import type { GitService } from './git-service.ts'
import { PollGuard } from './poll-guard.ts'

const OK = (value: unknown): PanelEnvelope<unknown> => ({ ok: true, value })
const FAIL = (error: PanelError): PanelEnvelope<never> => ({ ok: false, error })

/** Structural request failure (never a workspace fault). */
const BAD_REQUEST: PanelError = { code: 'internal', message: 'malformed request' }
/** Malformed service view failure. */
const MALFORMED_VIEW: PanelError = { code: 'internal', message: 'malformed git response' }

/** One SSE subscriber: a root and its last pushed git signature. */
interface Subscriber {
  root: string
  lastGit: string
  res: ServerResponse
}

const GIT_POLL_MS = 30_000
const HEARTBEAT_MS = 15_000
const GIT_STATUS_TIMEOUT_MS = 15_000
const GIT_POLL_DEADLINE_MS = Number.MAX_SAFE_INTEGER
const GIT_POLL_MAX_BACKOFF_MS = GIT_POLL_MS
const BODY_CAP_BYTES = 1 << 20

/** Loopback trust fence (same judgment dsh-ssh applies to its host routes). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Write the shared non-loopback rejection. */
function forbidden(res: ServerResponse): void {
  res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: 'forbidden: loopback-only' }))
}

/** Read a JSON request body into an unknown value; null when unparseable. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    total += buffer.length
    if (total > BODY_CAP_BYTES) {
      req.destroy()
      chunks.length = 0
      return null
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Extract the required string field from a JSON object payload. */
function strField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** Extract a string field, accepting the empty string as a value. */
function strOrEmpty(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

/** Extract a string array field (defaults to []). */
function strArray(payload: unknown, key: string): string[] | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  if (!value.every((item) => typeof item === 'string')) return null
  return value as string[]
}

/** Write one JSON envelope response. */
function json(res: ServerResponse, envelope: PanelEnvelope<unknown>, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(envelope))
}

/** Send a service view under the ok envelope, rejecting structurally invalid values. */
function okView(res: ServerResponse, value: unknown, guard: (view: unknown) => boolean): void {
  if (value !== null && !guard(value)) {
    json(res, FAIL(MALFORMED_VIEW))
    return
  }
  json(res, OK(value))
}

/**
 * Register the /git and /workbench routes.
 * @param ctx - context carrying the webServer service.
 * @param fs - the gated filesystem service.
 * @param git - the gated (unified) git service.
 * @returns the route disposers.
 */
export function registerRoutes(ctx: Context, fs: FsService, git: GitService): () => void {
  const subscribers = new Set<Subscriber>()
  let gitPoll: PollGuard | undefined
  let heartbeatTimer: NodeJS.Timeout | undefined

  const push = (subscriber: Subscriber, payload: unknown): void => {
    subscriber.res.write(`event: change\ndata: ${JSON.stringify(payload)}\n\n`)
  }

  let gitProbed = false
  let gitUnavailable = false
  const pollGit = async (): Promise<void> => {
    if (!gitProbed) {
      gitProbed = true
      if (!(await git.gitAvailable())) {
        gitUnavailable = true
        ctx.logger.warn('dsh-workbench: git binary unavailable, SCM polling disabled')
        for (const subscriber of subscribers) push(subscriber, { kind: 'gitUnavailable' })
      }
    }
    if (gitUnavailable) return
    await Promise.all([...subscribers].map(async (subscriber) => {
      try {
        if (!(await git.isRepositoryCanonical(subscriber.root))) return
        const status = await Promise.race([
          git.statusCanonical(subscriber.root),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('git status timed out')), GIT_STATUS_TIMEOUT_MS)
          }),
        ])
        if (status === null) return
        const key = `${status.branch}|${status.head}|${status.operationInProgress}|${JSON.stringify(status.staged)}|${JSON.stringify(status.unstaged)}|${JSON.stringify(status.untracked)}`
        if (key === subscriber.lastGit) return
        subscriber.lastGit = key
        push(subscriber, { kind: 'git', status })
      } catch (error: unknown) {
        ctx.logger.warn(`dsh-workbench: git poll failed for ${subscriber.root}: ${String(error)}`)
      }
    }))
  }

  const startGitPoll = (): void => {
    if (gitPoll !== undefined) return
    gitPoll = new PollGuard({
      intervalMs: GIT_POLL_MS,
      deadlineMs: GIT_POLL_DEADLINE_MS,
      maxBackoffMs: GIT_POLL_MAX_BACKOFF_MS,
      onRun: pollGit,
    })
    gitPoll.start()
  }
  const stopGitPoll = (): void => {
    if (gitPoll === undefined) return
    gitPoll.stop()
    gitPoll = undefined
  }

  // ── /workbench fs routes ─────────────────────────────────────────────────

  const serveRaw = async (url: URL, res: ServerResponse): Promise<void> => {
    const root = url.searchParams.get('root')
    const path = url.searchParams.get('path')
    if (root === null || root === '' || path === null || path === '') {
      json(res, FAIL(BAD_REQUEST), 400)
      return
    }
    const result = await fs.readRaw(root, path)
    if (!('data' in result)) {
      const status = result.code === 'path-outside-root' || result.code === 'is-directory' ? 403 : 404
      json(res, FAIL(result), status)
      return
    }
    res.writeHead(200, {
      'content-type': result.mime,
      'content-length': result.size,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    })
    res.end(result.data)
  }

  const fsHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      forbidden(res)
      return
    }
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/workbench/raw') {
        await serveRaw(url, res)
        return
      }
      res.writeHead(405)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      json(res, FAIL(BAD_REQUEST), 415)
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    const payload = await readJsonBody(req)
    if (payload === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }
    const root = strField(payload, 'root')
    if (root === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }
    switch (pathname) {
      case '/workbench/list': {
        const path = strField(payload, 'path') ?? ''
        const result = await fs.list(root, path)
        json(res, 'entries' in result ? OK(result) : FAIL(result))
        return
      }
      case '/workbench/read': {
        const path = strField(payload, 'path')
        if (path === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const asImage = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).asImage === true
          : false
        const result = await fs.read(root, path, asImage)
        json(res, 'content' in result ? OK(result) : FAIL(result))
        return
      }
      case '/workbench/write': {
        const path = strField(payload, 'path')
        const content = strOrEmpty(payload, 'content')
        if (path === null || content === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const rawBase = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).baseMtime
          : undefined
        const baseMtime = typeof rawBase === 'number' && Number.isFinite(rawBase) ? rawBase : undefined
        const result = await fs.write(root, path, content, baseMtime)
        json(res, 'mtime' in result ? OK(result) : FAIL(result))
        return
      }
      case '/workbench/search': {
        const query = strField(payload, 'query') ?? ''
        const result = await fs.search(root, query)
        json(res, 'hits' in result ? OK(result) : FAIL(result))
        return
      }
      case '/workbench/delete': {
        const path = strField(payload, 'path')
        if (path === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await fs.delete(root, path)
        json(res, 'ok' in result ? OK(result) : FAIL(result))
        return
      }
      default:
        res.writeHead(404)
        res.end()
    }
  }

  // ── /git routes ──────────────────────────────────────────────────────────

  const gitHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      forbidden(res)
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      json(res, FAIL(BAD_REQUEST), 415)
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    const payload = await readJsonBody(req)
    if (payload === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }
    const root = strField(payload, 'root')
    if (root === null) {
      json(res, FAIL(BAD_REQUEST))
      return
    }
    switch (pathname) {
      case '/git/status': {
        const result = await git.status(root)
        if (result === null) json(res, OK(null))
        else if (isPanelError(result)) json(res, FAIL(result))
        else okView(res, result, isGitStatusView)
        return
      }
      case '/git/branches': {
        const result = await git.branches(root)
        if (result === null) json(res, OK(null))
        else if (isPanelError(result)) json(res, FAIL(result))
        else okView(res, result, isBranchesView)
        return
      }
      case '/git/graph': {
        const rawLimit = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).limit
          : undefined
        const limit = typeof rawLimit === 'number' && rawLimit > 0 && rawLimit <= 1000 ? rawLimit : undefined
        const result = await git.graph(root, limit)
        if (result === null) json(res, OK(null))
        else if (isPanelError(result)) json(res, FAIL(result))
        else okView(res, result, isGraphView)
        return
      }
      case '/git/switch': {
        const branch = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).branch
          : undefined
        if (typeof branch !== 'string' || branch === '') {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await git.switchBranch(root, branch)
        json(res, result.ok ? OK({ branch: result.branch }) : FAIL(result.error))
        return
      }
      case '/git/create-branch': {
        const name = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).name
          : undefined
        if (typeof name !== 'string' || name === '') {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await git.createBranch(root, name)
        json(res, result.ok ? OK({ branch: result.branch }) : FAIL(result.error))
        return
      }
      case '/git/commit': {
        const message = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).message
          : undefined
        if (typeof message !== 'string') {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await git.commit(root, message)
        json(res, result.ok ? OK({ head: result.head }) : FAIL(result.error))
        return
      }
      case '/git/push': {
        const result = await git.push(root)
        json(res, result.ok ? OK({ output: result.output }) : FAIL(result.error))
        return
      }
      case '/git/pull': {
        const result = await git.pull(root)
        json(res, result.ok ? OK({ output: result.output }) : FAIL(result.error))
        return
      }
      case '/git/diff': {
        const path = strField(payload, 'path')
        if (path === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const staged = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).staged === true
          : false
        const result = await git.diff(root, path, staged)
        json(res, 'content' in result ? OK(result) : FAIL(result))
        return
      }
      case '/git/stage': {
        const paths = strArray(payload, 'paths')
        if (paths === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await git.stage(root, paths)
        json(res, 'applied' in result ? OK(result) : FAIL(result))
        return
      }
      case '/git/unstage': {
        const paths = strArray(payload, 'paths')
        if (paths === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await git.unstage(root, paths)
        json(res, 'applied' in result ? OK(result) : FAIL(result))
        return
      }
      case '/git/discard': {
        const paths = strArray(payload, 'paths')
        if (paths === null) {
          json(res, FAIL(BAD_REQUEST))
          return
        }
        const result = await git.discard(root, paths)
        json(res, 'applied' in result ? OK(result) : FAIL(result))
        return
      }
      default:
        res.writeHead(404)
        res.end()
    }
  }

  // ── /workbench/events SSE ────────────────────────────────────────────────

  const sse = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      forbidden(res)
      return
    }
    const url = new URL(req.url ?? '/', 'http://x')
    const root = url.searchParams.get('root')
    if (root === null || root === '') {
      res.writeHead(400)
      res.end()
      return
    }
    const gated = await fs.verify(root)
    if (!gated.ok) {
      json(res, FAIL(gated.error), 400)
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write('retry: 2000\n\n')
    const subscriber: Subscriber = { root: gated.canonical, lastGit: '', res }
    subscribers.add(subscriber)
    if (gitUnavailable) push(subscriber, { kind: 'gitUnavailable' })
    startGitPoll()
    if (heartbeatTimer === undefined) {
      heartbeatTimer = setInterval(() => {
        for (const current of subscribers) current.res.write(': ping\n\n')
      }, HEARTBEAT_MS)
    }
    const disposeWatch = fs.watch(gated.canonical, () => {
      push(subscriber, { kind: 'fs' })
    })
    req.on('close', () => {
      disposeWatch()
      subscribers.delete(subscriber)
      if (subscribers.size === 0) {
        stopGitPoll()
        if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer)
        heartbeatTimer = undefined
      }
    })
  }

  const disposers = [
    ctx.webServer.register({ kind: 'prefix', path: '/workbench', handler: fsHandler }),
    ctx.webServer.register({ kind: 'prefix', path: '/git', handler: gitHandler }),
    ctx.webServer.register({ kind: 'exact', path: '/workbench/events', handler: sse }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
    stopGitPoll()
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer)
    for (const subscriber of subscribers) subscriber.res.end()
    subscribers.clear()
  }
}
