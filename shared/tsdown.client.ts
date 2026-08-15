/**
 * Standalone tsdown preset for the dsh-workbench UI plugin (vendored and
 * adapted from dsh-web-ui's shared/tsdown.client.ts, BSD-3-Clause). Emits a
 * closure-factory artifact: the bundle calls window.__ModuleLoader__.load
 * ({id, factory}) and resolves externals through the injected require
 * (loader module table — cordis DI entities, no globals, no import map).
 * CSS Modules are compiled by lightningcss inside the bundle: importing
 * `x.module.css` yields the hashed class map, and the css text auto-injects
 * a <style data-plugin="<id>"> tag at factory execution (the loader removes
 * plugin-owned tags on unload). The platform module list mirrors the shell's
 * seed table in `./web-platform.ts`.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { PLATFORM_MODULES } from './web-platform.ts'

/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Wire/type layers a client bundle may inline. */
export const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

/** Workspace mode replaces an empty config array with the root defaults. */
const SKIP_WORKSPACE_BUILD: UserConfig = { entry: '' }

/** Temporary exemption: the snapshot-store engine lives in runtime. */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

/** Externals resolved from the loader module table. */
export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Rebase a physical path onto a repository-relative id when it lives under the repo. */
function repositoryRelativePath(physical: string): string {
  if (!isAbsolute(physical)) return physical
  const repositoryPath = relative(REPOSITORY_ROOT, physical).split(sep).join('/')
  return repositoryPath.startsWith('../') ? physical : repositoryPath
}

/** Rebase a physical lib-relative source onto a browser URL (standalone repo: plain repo-relative path). */
function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolvePath(dirname(sourcemapPath), source)
  const repositoryPath = relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/')
  return repositoryPath.startsWith('../') ? source : repositoryPath
}

/** Build the tsdown config for one UI plugin package (node half + browser bundle). */
export function clientBundle(
  id: string,
  libEntry: readonly string[],
  options: ClientBundleOptions = {},
): BuildFaceConfig {
  const lib = clientLibraryConfig(id, libEntry, options.lib, options.libExternal)
  return ({ env }) => {
    const face = buildFace(env?.DSH_BUILD_FACE)
    const hasClient = existsSync(resolvePath(process.cwd(), 'src/client/index.ts'))
    const client = hasClient ? clientConfig(id, face === undefined
      ? 'src/client/index.ts'
      : 'lib/types/client/index.js') : undefined
    const node = [lib, ...(options.companions ?? [])]
    if (face === 'host') return options.hostPhase === true ? node : [SKIP_WORKSPACE_BUILD]
    if (face === 'client') return options.hostPhase === true ? (client ? [client] : []) : (client ? [...node, client] : node)
    return client ? [...node, client] : node
  }
}

/** The standalone mobile page bundle (unused here; kept for API parity). */
export function mobileBundle(id: string, entry: string): UserConfig {
  const mobileRequire = createRequire(import.meta.url)
  return {
    name: `${id}/mobile`,
    entry: { mobile: entry },
    outDir: 'lib',
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [],
    noExternal: [/.*/],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      name: 'dsh-mobile-value-resolution',
      resolveId(source: string) {
        const match = /^@deepseek-ai\/dsh-host-apiproxy\/api(?:\/.*)?$/.exec(source)
        if (match === null) return null
        try {
          return mobileRequire.resolve(source)
        } catch {
          return null
        }
      },
    }],
    outputOptions: {
      entryFileNames: 'mobile.js',
    },
  }
}

interface ClientBundleOptions {
  readonly hostPhase?: boolean
  readonly companions?: readonly UserConfig[]
  readonly lib?: UserConfig
  readonly libExternal?: readonly (string | RegExp)[]
}

type BuildFace = 'host' | 'client' | undefined

type BuildFaceConfig = (inlineConfig: Pick<UserConfig, 'env'>) => UserConfig[]

function buildFace(value: unknown): BuildFace {
  if (value === undefined || value === 'host' || value === 'client') return value
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

function clientLibraryConfig(
  id: string,
  libEntry: readonly string[],
  overrides: UserConfig = {},
  extraExternal: readonly (string | RegExp)[] = [],
): UserConfig {
  return {
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    external: ['@deepseek-ai/cordis', ...extraExternal],
    ...overrides,
  }
}

function clientConfig(id: string, entry: string): UserConfig {
  return {
    name: `${id}/client`,
    entry: { client: entry },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    plugins: [{
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS), an inline-safe wire layer, or a generated /remote contribution — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
        )
      },
    }, {
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
        return CSS_VIRTUAL_PREFIX + repositoryRelativePath(abs) + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        const physical = isAbsolute(fileId) ? fileId : resolvePath(REPOSITORY_ROOT, fileId)
        this.addWatchFile(physical)
        const source = await readFile(physical)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
          classMap[local] = exp.name
        }
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
          '  const tag = document.createElement(\'style\');',
          `  tag.dataset.plugin = ${JSON.stringify(id)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapPathTransform: browserSourcePath,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}
