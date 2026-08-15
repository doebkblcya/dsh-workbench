# dsh-workbench 交接文档

> 最后更新：2026-08-15
> 维护者：doebk（doebkblcya）

## 一、项目是什么

一个给 **DSH Web GUI** 用的单包插件（双面：宿主侧 host + 浏览器侧 client），在右侧加一个
VS Code 风格的**工作台**：一个 **Preview（预览）栏** + 一个带 **文件 / Git 两个 tab** 的
**单一工作台面板**。

- fork 自 [zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) 的
  `dsh-aionui-panel` + `dsh-git-graph`（均 0.1.15），**一次性分叉、不追上游 rebase**。
- 许可证：**BSD-3-Clause**（按上游实际发布的包内 LICENSE，而非仓库根的 Apache-2.0）。
- 包名：`@doebkblcya/dsh-workbench`，版本 `0.1.0`。
- GitHub：https://github.com/doebkblcya/dsh-workbench （公开，`main` 分支，4 个 commit）。

---

## 二、项目已经有了什么

### 源码（45 个文件，`src/`）

| 层 | 目录 | 内容 |
|---|---|---|
| 共享 | `src/core/` | 类型定义、git argv 构造器、porcelain/graph/branch 解析、泳道计算、错误分类 |
| 宿主侧 | `src/host/` | `fs-service`（门控文件系统）、`git-service`（统一 git 服务）、`routes`（HTTP 路由）、`gate`（工作区门控）、`poll-guard`（轮询） |
| 浏览器侧 | `src/client/` | `layout`（DOM 布局控制器）、`store`（无框架 store）、`mount`、`api`、组件、preview、drag、styles |

### 关键组件（`src/client/components/`）

- `WorkbenchPanel` —— 单栏 + [文件 / Git] tab 栏 + 收起箭头
- `ExplorerPanel` —— 文件树 + 文件名搜索
- `GitPanel` —— 分支栏 + 提交框 + 变更列表 + 图谱（上下分屏）
- `ScmPanel` / `BranchPopover` / `CreateBranchDialog` / `GraphPanel`

### 构建与配置

- 构建：`npm run build` = `tsc -b && tsdown` → `lib/index.js`（host）+ `lib/client.js`（browser CJS bundle，CSS 内联）
- `shared/`：vendored `tsdown.client.ts` + `web-platform.ts`（`window.__ModuleLoader__.load` 闭包工厂）
- `cordis.patch.yml`：`insert: [{id: ui-dsh-workbench, name: 'dsh-workbench'}]`
- 文档：`README.md`（英文）/ `README.zh-CN.md`（中文，互链）、`LICENSE`、`NOTICE`、`.gitattributes`、`.gitignore`

### 宿主侧路由

- `/workbench/*` —— fs：list / read / raw / write / search / delete
- `/git/*` —— git：status / diff / stage / unstage / discard / branches / switch / create-branch / commit / push / pull / graph
- `/workbench/events` —— SSE（fs watch + git 轮询合流）

---

## 三、现在已经做到哪了（功能清单）

| 功能 | 状态 |
|---|---|
| 文件树 + 文件名搜索（懒加载、拖拽进输入框） | ✅ |
| 多格式预览（markdown/html/code/diff/csv/pdf/office/图片/文本；源码↔预览、分屏编辑、保存） | ✅ |
| 变更列表（stage / unstage / discard / discardAll） | ✅ |
| 分支切换 / 新建（冲突 / worktree / 进行中操作守卫） | ✅ |
| 内嵌 Git 图谱（泳道、分页、ref 标签） | ✅ |
| commit（operationInProgress 守卫 + 错误透传） | ✅ |
| push / pull（upstream 预检 + identity / no-upstream / fast-forward / diverged 错误分类） | ✅ |
| SSE 变更流（fs + git 合流） | ✅ |

### 布局（当前最终形态）

- 5 轨网格：`[shell 侧栏][聊天][shell 详情][Preview][工作台单栏]`
- 工作台单栏：顶部 [文件 / Git] tab + 收起箭头，内容随 tab 切换（两个 body 常驻挂载，切 tab 不丢状态）
- Preview：贴在工作台左侧，点文件才打开
- 收起/展开：右栏可整体收起，屏幕右缘中部浮出「展开」按钮（24×72px、左指箭头、悬停提示）

### 本轮（本次会话）完成的改动

1. **单栏改造**：三栏 `[Preview][Git][Files]` → 单栏 [文件/Git tab] + Preview
2. **图谱死循环修复**：非 git 目录不再一直「加载中」（加 `graphLoaded` 标志 + branches/graph 独立 seq）
3. **展开按钮打磨**：加大、箭头改左、加 tooltip
4. **包名** → `@doebkblcya/dsh-workbench`（`publishConfig.access: public` + keywords）
5. **locale 命名空间** `aionui-panel` → `dsh-workbench`；`@module` 注释旧包名统一改
6. **README 双语** + `.gitattributes`（LF 归一 + lockfile 折叠）；npm 安装段先划掉（未发布）
7. **GitHub 建仓 + 推送**（4 commits）

---

## 四、哪里还有问题（待办 / 风险）

### 🔴 关键

1. **真机冒烟未做** —— 本轮所有 UI 改动（单栏、tab 切换、图谱修复、展开按钮）都**还没重启 dsh web 验证过**。这是当前最大的未知数。

### 🟡 待办

2. **npm 未发布** —— 包已就绪但没发。需先注册 npm 账号（npmjs.com，用户名建议 `doebkblcya`，与 scope 一致）+ `npm login` + `npm publish --access public`（首次）。
3. **remote-web-ui 已卸载** —— 移动端远程控制功能没了。若还要手机远程，装回 `@linxin666/dsh-remote-web-ui@0.1.12`。
4. **死代码** —— `tokens.module.css` 里「隐藏『检查更新』按钮」的 CSS 是给 remote-web-ui 用的，现在它已卸载，这段规则成了死代码，可删。
5. **push/pull 仍是基础版** —— 只有「管道 + 错误分类」。交互式认证、分叉冲突 UI、并发锁**明确不做**（之前拍板）。如后续需要，这是二期待办。

### 🟢 已解决 / 备忘

6. **供应链年龄门槛（pnpm 24h 冷却）** —— 已通过「卸载全部 `@linxin666` 插件 + 升级 pnpm 到 11.21.0」绕过。但 pnpm 的 `minimumReleaseAgeExclude` 白名单 bug（[#10266](https://github.com/pnpm/pnpm/issues/10266)）本质还在：**若以后重装 linxin 新发布的包，会再次复现**。
7. **`cordis.patch.yml`（用户 patch 层）里 `webserver 0.0.0.0:3080` 仍开着局域网访问** —— 跟 remote-web-ui 卸载后，手机控制界面没了，但端口仍对外。若不用手机远程，建议改回 `127.0.0.1`。

---

## 五、需要后面做什么（下一步）

### 1. 真机冒烟（最优先）

重启 dsh web 后重点验证：

- [ ] 右侧是「单栏 + [文件/Git] tab」，不再是三栏
- [ ] tab 能切换，文件树 / Git 内容正确
- [ ] 点文件 → 左侧 Preview 弹出、能预览/编辑/保存
- [ ] Git tab：变更列表、暂存/取消/放弃、提交、分支切换、图谱正常
- [ ] 非 git 目录：图谱显示「不是 git 仓库」，不再转圈
- [ ] 右栏收起后，右侧浮出「展开」按钮可点

### 2. 发 npm 包

- [ ] 注册 npm 账号（用户名 `doebkblcya`）+ `npm login`
- [ ] `npm publish --access public`（首次）
- [ ] 发布后：把 README 里 npm 安装的 `~~划掉~~` 取消

### 3. 可选收尾

- [ ] 装回 remote-web-ui（若需手机远程）；装回后重新加「检查更新」隐藏规则
- [ ] 删除 `tokens.module.css` 里已失效的「检查更新」隐藏规则
- [ ] 若不用手机远程：把 `cordis.patch.yml` 的 `webserver host` 改回 `127.0.0.1`

---

## 附：常用命令

```sh
# 构建
npm install && npm run build        # tsc -b && tsdown

# 本地安装到 profile
dsh plugin --profile web add link:/home/doebk/code/dsh-workbench

# 类型检查 / 测试
npm run typecheck
npm test
```

### profile 当前状态（`~/.dsh/profiles/web/`）

- 剩余 bundles（5）：`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-vision-proxy`、`@omdsh-dev/dsh-genui`、`@doebkblcya/dsh-workbench`
- 已卸载：全部 `@linxin666/*`（aionui-panel、git-graph、skins、skin-center、task-board、web-ui-settings、remote-web-ui）
- pnpm：11.21.0（已从 11.3.0 升级，走 nvm 下新装版本）
