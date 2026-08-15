/**
 * Locale strings for the panel surfaces (zh/en). The client registers the
 * dictionary through the locale service like the sibling plugins; copy is
 * deliberately short and technical.
 * @module dsh-workbench/client/locales
 */

import type { PanelError } from '../core/types.ts'

const zh = {
  'explorer.tabs.files': '文件',
  'explorer.tabs.changes': '变更',
  'explorer.search.placeholder': '按文件名搜索',
  'explorer.search.searching': '搜索中…',
  'explorer.search.empty': '没有匹配的文件',
  'explorer.search.error': '搜索失败',
  'explorer.search.truncated': '结果过多，仅显示前 {count} 条',
  'explorer.tree.empty': '项目为空',
  'explorer.collapse': '收起面板',
  'explorer.expand': '展开面板',
  'explorer.openPreview': '打开预览',
  'explorer.drag.dropHint': '松手插入文件路径',
  'scm.repositories': '存储库',
  'scm.changes': '变更',
  'scm.staged': '已暂存',
  'scm.unstaged': '变更',
  'scm.untracked': '未跟踪',
  'scm.conflicted': '冲突',
  'scm.stage': '暂存',
  'scm.unstage': '取消暂存',
  'scm.discard': '放弃更改',
  'scm.stageAll': '全部暂存',
  'scm.discardAll': '全部放弃',
  'scm.empty': '没有更改',
  'scm.notRepo': '当前目录不是 git 仓库',
  'scm.gitMissing': '未检测到 git，请先安装 git 后重试',
  'scm.loading': '读取状态中…',
  'scm.failed': '操作失败',
  'scm.viewList': '列表视图',
  'scm.viewTree': '树视图',
  'scm.discardConfirmTracked': '放弃对 {count} 个文件的更改？此操作不可恢复。',
  'scm.discardConfirmUntracked': '删除 {count} 个未跟踪文件？此操作不可恢复。',
  'preview.noTabs': '没有打开的预览',
  'preview.newUrlTab': '新建 URL 预览',
  'preview.collapsePanel': '收起预览面板',
  'preview.source': '源码',
  'preview.preview': '预览',
  'preview.editor': '编辑器',
  'preview.split': '分屏',
  'preview.refresh': '刷新',
  'preview.refresh.updated': '文件已在磁盘更新',
  'preview.save': '保存',
  'preview.download': '下载',
  'preview.openExternal': '在系统应用中打开',
  'preview.dirty': '未保存的更改',
  'preview.closeLeft': '关闭左侧',
  'preview.closeRight': '关闭右侧',
  'preview.closeOthers': '关闭其他',
  'preview.closeAll': '关闭全部',
  'preview.closeConfirmTitle': '关闭未保存的标签页',
  'preview.closeConfirmBody': '{count} 个标签页有未保存的更改，关闭将丢失这些更改。',
  'preview.saved': '已保存',
  'preview.saveConflict': '文件已在磁盘上被修改，保存冲突：请刷新后重试',
  'preview.errorOversized': '文件过大，仅加载前 80,000 字符',
  'preview.unsupported': '此格式暂不支持预览',
  'preview.downloadHint': '可在系统应用中打开或下载查看',
  'preview.url.placeholder': '输入网址，回车打开',
  'preview.url.hint': '按 Esc 还原',
  'common.cancel': '取消',
  'common.confirm': '确定',
  'common.close': '关闭',
  'common.delete': '删除',
  'common.copyPath': '复制路径',
  'common.copied': '已复制',
  'git.tab': 'Git',
  'git.branch': '分支',
  'git.branch.detached': '分离 HEAD',
  'git.commit.message': '提交信息（Ctrl+Enter 提交）',
  'git.commit.button': '提交',
  'git.commit.empty': '没有暂存的更改',
  'git.commit.hint': '先暂存更改，再填写信息提交',
  'git.commit.success': '已提交',
  'git.push': '推送',
  'git.pull': '拉取',
  'git.sync.loading': '同步中…',
  'git.branch.search': '搜索分支',
  'git.branch.empty': '没有匹配的分支',
  'git.branch.dirty': '未提交的更改：{count} 个文件',
  'git.branch.create': '创建并检出新分支…',
  'git.branch.createDialog.title': '创建并检出新分支',
  'git.branch.createDialog.description': '基于当前 HEAD 创建新分支并立即切换。',
  'git.branch.createDialog.nameLabel': '分支名',
  'git.branch.createDialog.placeholder': '例如 feature/git-workbench',
  'git.branch.createDialog.confirm': '创建并切换',
  'git.branch.createDialog.cancel': '取消',
  'git.graph.title': 'Git 图谱',
  'git.graph.subtitle': '{count} 个提交 · {lanes} 条泳道',
  'git.graph.loading': '加载中…',
  'git.graph.loadMore': '加载更多',
  'git.graph.empty': '没有提交记录',
  'git.graph.notRepo': '当前目录不是 git 仓库',
  'git.graph.time.justNow': '刚刚',
  'git.graph.time.minutesAgo': '{count} 分钟前',
  'git.graph.time.hoursAgo': '{count} 小时前',
  'git.graph.time.daysAgo': '{count} 天前',
  'git.error.conflictsPresent': '还有未解决的冲突，先处理完再切换分支。',
  'git.error.operationInProgress': '还有进行中的 Git 操作（如 rebase / merge），先完成它再操作。',
  'git.error.branchInOtherWorktree': '目标分支已在其他 worktree 检出。',
  'git.error.trackedOverwrite': '切换会覆盖这些已跟踪文件的修改：{paths}。',
  'git.error.untrackedOverwrite': '切换会覆盖这些未跟踪文件：{paths}。',
  'git.error.moreFiles': '等另外 {count} 个文件',
  'git.error.targetBranchNotFound': '目标分支不存在于本地。',
  'git.error.invalidBranchName': '分支名无效，请重新输入。',
  'git.error.branchAlreadyExists': '分支已存在。',
  'git.error.workspaceUnknown': '当前目录不是已注册的工作区。',
  'git.error.internal': '操作失败，请稍后重试。',
  'git.error.nothingToCommit': '没有需要提交的更改，先暂存再提交。',
  'git.error.commitFailed': '提交失败。',
  'git.error.notARepository': '当前目录不是 git 仓库。',
  'git.error.authRequired': '需要认证：请在终端配置 git 凭据后重试。',
  'git.error.syncRejected': '同步被拒绝，可能需要先拉取或解决冲突。',
  'git.error.identityUnconfigured': '尚未配置 git 身份（user.name / user.email）。请在终端执行：git config --global user.name "你的名字"；git config --global user.email "你的邮箱"。',
  'git.error.noUpstream': '当前分支没有上游分支。先在终端执行 git push -u origin <分支名> 建立跟踪，再同步。',
  'git.toast.switchSuccess': '已切换到分支 {branchName}',
  'git.toast.createSuccess': '已创建并切换到分支 {branchName}',
} as const

const en: Record<keyof typeof zh, string> = {
  'explorer.tabs.files': 'Files',
  'explorer.tabs.changes': 'Changes',
  'explorer.search.placeholder': 'Search file names',
  'explorer.search.searching': 'Searching…',
  'explorer.search.empty': 'No matching files',
  'explorer.search.error': 'Search failed',
  'explorer.search.truncated': 'Too many results, showing first {count}',
  'explorer.tree.empty': 'The project is empty',
  'explorer.collapse': 'Collapse panel',
  'explorer.expand': 'Expand panel',
  'explorer.openPreview': 'Open preview',
  'explorer.drag.dropHint': 'Release to insert the file path',
  'scm.repositories': 'Repositories',
  'scm.changes': 'Changes',
  'scm.staged': 'Staged',
  'scm.unstaged': 'Changes',
  'scm.untracked': 'Untracked',
  'scm.conflicted': 'Conflict',
  'scm.stage': 'Stage',
  'scm.unstage': 'Unstage',
  'scm.discard': 'Discard',
  'scm.stageAll': 'Stage all',
  'scm.discardAll': 'Discard all',
  'scm.empty': 'No changes',
  'scm.notRepo': 'Not a git repository',
  'scm.gitMissing': 'Git is not installed. Install git and reload to use the changes panel',
  'scm.loading': 'Loading status…',
  'scm.failed': 'Operation failed',
  'scm.viewList': 'List view',
  'scm.viewTree': 'Tree view',
  'scm.discardConfirmTracked': 'Discard changes in {count} files? This cannot be undone.',
  'scm.discardConfirmUntracked': 'Delete {count} untracked files? This cannot be undone.',
  'preview.noTabs': 'No open previews',
  'preview.newUrlTab': 'New URL preview',
  'preview.collapsePanel': 'Collapse preview panel',
  'preview.source': 'Source',
  'preview.preview': 'Preview',
  'preview.editor': 'Editor',
  'preview.split': 'Split',
  'preview.refresh': 'Refresh',
  'preview.refresh.updated': 'File updated on disk',
  'preview.save': 'Save',
  'preview.download': 'Download',
  'preview.openExternal': 'Open in system app',
  'preview.dirty': 'Unsaved changes',
  'preview.closeLeft': 'Close left',
  'preview.closeRight': 'Close right',
  'preview.closeOthers': 'Close others',
  'preview.closeAll': 'Close all',
  'preview.closeConfirmTitle': 'Close unsaved tabs',
  'preview.closeConfirmBody': '{count} tabs have unsaved changes. Closing will lose them.',
  'preview.saved': 'Saved',
  'preview.saveConflict': 'File changed on disk. Save conflict: refresh and retry',
  'preview.errorOversized': 'File too large, only the first 80,000 characters loaded',
  'preview.unsupported': 'Preview not supported for this format',
  'preview.downloadHint': 'Open in a system app or download to view',
  'preview.url.placeholder': 'Enter a URL and press Enter',
  'preview.url.hint': 'Press Esc to revert',
  'common.cancel': 'Cancel',
  'common.confirm': 'OK',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.copyPath': 'Copy path',
  'common.copied': 'Copied',
  'git.tab': 'Git',
  'git.branch': 'Branch',
  'git.branch.detached': 'Detached HEAD',
  'git.commit.message': 'Commit message (Ctrl+Enter to commit)',
  'git.commit.button': 'Commit',
  'git.commit.empty': 'No staged changes',
  'git.commit.hint': 'Stage changes, then write a message to commit',
  'git.commit.success': 'Committed',
  'git.push': 'Push',
  'git.pull': 'Pull',
  'git.sync.loading': 'Syncing…',
  'git.branch.search': 'Search branches',
  'git.branch.empty': 'No matching branches',
  'git.branch.dirty': 'Uncommitted changes: {count} files',
  'git.branch.create': 'Create and switch to new branch…',
  'git.branch.createDialog.title': 'Create and switch to new branch',
  'git.branch.createDialog.description': 'Create a new branch from the current HEAD and switch to it.',
  'git.branch.createDialog.nameLabel': 'Branch name',
  'git.branch.createDialog.placeholder': 'For example, feature/git-workbench',
  'git.branch.createDialog.confirm': 'Create and switch',
  'git.branch.createDialog.cancel': 'Cancel',
  'git.graph.title': 'Git Graph',
  'git.graph.subtitle': '{count} commits · {lanes} lanes',
  'git.graph.loading': 'Loading…',
  'git.graph.loadMore': 'Load more',
  'git.graph.empty': 'No commits',
  'git.graph.notRepo': 'Not a git repository',
  'git.graph.time.justNow': 'just now',
  'git.graph.time.minutesAgo': '{count} minutes ago',
  'git.graph.time.hoursAgo': '{count} hours ago',
  'git.graph.time.daysAgo': '{count} days ago',
  'git.error.conflictsPresent': 'Unresolved conflicts remain. Resolve them before switching branches.',
  'git.error.operationInProgress': 'Another Git operation (e.g. rebase/merge) is in progress. Finish it first.',
  'git.error.branchInOtherWorktree': 'That branch is already checked out in another worktree.',
  'git.error.trackedOverwrite': 'Switching would overwrite these tracked files: {paths}.',
  'git.error.untrackedOverwrite': 'Switching would overwrite these untracked files: {paths}.',
  'git.error.moreFiles': '{count} more files',
  'git.error.targetBranchNotFound': 'The target branch does not exist locally.',
  'git.error.invalidBranchName': 'The branch name is invalid. Enter a different name.',
  'git.error.branchAlreadyExists': 'That branch already exists.',
  'git.error.workspaceUnknown': 'This directory is not a registered workspace.',
  'git.error.internal': 'The operation failed. Please try again.',
  'git.error.nothingToCommit': 'Nothing to commit. Stage changes first.',
  'git.error.commitFailed': 'Commit failed.',
  'git.error.notARepository': 'This directory is not a git repository.',
  'git.error.authRequired': 'Authentication required: configure git credentials in a terminal and retry.',
  'git.error.syncRejected': 'Sync rejected. Pull first or resolve conflicts.',
  'git.error.identityUnconfigured': 'Git identity is not configured (user.name / user.email). Run: git config --global user.name "Your Name" and git config --global user.email "you@example.com".',
  'git.error.noUpstream': 'The current branch has no upstream. Run `git push -u origin <branch>` first to set tracking.',
  'git.toast.switchSuccess': 'Switched to branch {branchName}',
  'git.toast.createSuccess': 'Created and switched to branch {branchName}',
}

export type AionUiPanelKey = keyof typeof zh

/** The dictionary namespace this plugin owns. */
export const NS = 'dsh-workbench'

/** Format one copy string with {name} placeholders. */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

/** Simple dictionary access (zh/en by a global flag the client sets). */
export const dictionaries: Record<'zh' | 'en', Record<AionUiPanelKey, string>> = { zh, en }

let currentLanguage: 'zh' | 'en' = 'zh'

/** Set the active language (the client mirrors the locale service). */
export function setLanguage(language: string): void {
  currentLanguage = language === 'en' ? 'en' : 'zh'
}

/** Translate one key with optional params. */
export function t(key: AionUiPanelKey, params?: Record<string, string | number>): string {
  const table = dictionaries[currentLanguage] ?? zh
  const template = table[key] ?? zh[key]
  return params === undefined ? template : format(template, params)
}

/**
 * Map a git rejection onto localized copy (the switch/create/commit/push/pull
 * error vocabulary). Blocked-file lists are rendered inline.
 */
export function gitErrorCopy(error: PanelError): string {
  const listed = (error.paths ?? []).map((p) => `"${p}"`).join('、')
  const more = error.moreFiles !== undefined && error.moreFiles > 0
    ? ` ${t('git.error.moreFiles', { count: error.moreFiles })}`
    : ''
  switch (error.code) {
    case 'conflicts-present': return t('git.error.conflictsPresent')
    case 'operation-in-progress': return t('git.error.operationInProgress')
    case 'branch-in-other-worktree': return t('git.error.branchInOtherWorktree')
    case 'tracked-changes-would-be-overwritten': return t('git.error.trackedOverwrite', { paths: `${listed}${more}` })
    case 'untracked-changes-would-be-overwritten': return t('git.error.untrackedOverwrite', { paths: `${listed}${more}` })
    case 'target-branch-not-found': return t('git.error.targetBranchNotFound')
    case 'invalid-branch-name': return t('git.error.invalidBranchName')
    case 'branch-already-exists': return t('git.error.branchAlreadyExists')
    case 'workspace-unknown': return t('git.error.workspaceUnknown')
    case 'nothing-to-commit': return t('git.error.nothingToCommit')
    case 'commit-failed': return error.message || t('git.error.commitFailed')
    case 'not-a-repository': return t('git.error.notARepository')
    case 'auth-required': return t('git.error.authRequired')
    case 'sync-rejected': return error.message || t('git.error.syncRejected')
    case 'git-identity-unconfigured': return t('git.error.identityUnconfigured')
    case 'no-upstream': return t('git.error.noUpstream')
    default: return error.message
  }
}
