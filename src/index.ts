/**
 * dsh-workbench — host half: the workspace-gated filesystem + unified git
 * services and their /workbench/* (fs) + /git/* (git) HTTP routes (JSON
 * operations + one SSE change stream) on the shared webserver. The browser
 * half (exports "./client") is served by client-modules from the same
 * package's dsh.client declaration.
 *
 * The host half also announces the plugin to every agent through the
 * system-prompt section mechanism, so agents know the workbench exists and
 * how to cooperate with it.
 *
 * Derived from dsh-web-ui's dsh-aionui-panel + dsh-git-graph (BSD-3-Clause),
 * merged into one package.
 * @module dsh-workbench
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { FsService } from './host/fs-service.ts'
import { GitService, subprocessRunner } from './host/git-service.ts'
import { createWorkspaceGate } from './host/gate.ts'
import { registerRoutes } from './host/routes.ts'

/** Required services: the route registry, the managed subprocess seam, the workspace registry, and the prompt band. */
export const inject = ['webServer', 'subprocess', 'workspaceRegistry', 'systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 210

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const WORKBENCH_GUIDANCE = '本机已安装 dsh-workbench 插件（DSH Web GUI 的右侧工作台）：项目会话打开时，聊天区右侧出现三列 [Preview 预览][Git][文件] 面板（文件贴最右）。能力：文件栏 Explorer 文件树（点击文件在预览面板打开、整行展开文件夹、按文件名搜索定位）；Preview 多 tab 预览（markdown/html/code/diff/csv/pdf/office/图片/文本等，支持源码/预览切换、分屏编辑、保存）；Git 栏上下分屏——上半为仿 VS Code Source Control 的「变更列表 + 提交框 + 分支切换」，下半为内嵌 Git 图谱；真实 git 能力含 stage/unstage/discard、commit、分支切换/新建（push/pull 为二期，认证与冲突处理较重）。面板宽度可拖拽，折叠状态与宽度按项目持久化（localStorage）。数据源为当前会话工作目录的真实文件系统与真实 git 仓库，宿主进程经 /workbench/* 与 /git/* 路由提供。用户提到「右侧面板 / 预览面板 / 文件树 / 变更面板 / Git 栏 / 提交 / 分支 / 图谱」时即指本插件，请据此协作。'

/**
 * Mount the panel data services and their routes.
 * @param ctx - context carrying webServer, subprocess, workspaceRegistry, systemPrompt.
 */
export function apply(ctx: Context): void {
  const gate = createWorkspaceGate(ctx)
  const fs = new FsService(gate)
  const git = new GitService(subprocessRunner(ctx), gate, (root, rel) => fs.delete(root, rel))
  ctx.effect(() => registerRoutes(ctx, fs, git), 'dsh-workbench: routes')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:workbench',
    order: SECTION_ORDER,
    text: WORKBENCH_GUIDANCE,
  }), 'dsh-workbench: prompt section')
}
