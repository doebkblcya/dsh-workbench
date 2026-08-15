# dsh-workbench — DSH Web GUI 右侧工作台

[English](./README.md) | **中文**

一个单包插件，为 DSH Web GUI 增加 VS Code 风格的右侧工作台：一个
**Preview（预览）** 栏，加一个带 **文件 / Git** 两个 tab 的**单一工作台面板**。

- **工作台面板**（贴最右）：顶部「文件 / Git」tab 栏。
  - **文件**：懒加载文件树 + 按文件名搜索。点文件在 Preview 栏打开；点文件夹行展开/收起。
  - **Git**：上下分屏。上半是仿 Source Control 的面板——分支栏（切换 / 新建分支）、
    提交框、变更列表（暂存 / 取消暂存 / 放弃）。下半是内嵌 Git 图谱。
- **Preview（预览）**（在工作台面板左侧）：markdown / html / code / diff / csv /
  pdf / office / 图片 / 文本的多 tab 预览，支持源码↔预览切换、分屏编辑和保存。

## 功能

| 能力 | 状态 |
|---|---|
| 文件树 + 文件名搜索 | ✅ |
| 多格式预览 | ✅ |
| 变更列表（暂存 / 取消暂存 / 放弃） | ✅ |
| 分支切换 / 新建 | ✅ |
| 内嵌 Git 图谱 | ✅ |
| 提交 | ✅ |
| 推送 / 拉取 | ✅（宿主侧认证） |

## 架构

- **宿主侧**（`src/host`、`src/index.ts`）：工作区门控的文件系统 + *统一* 的 git
  服务，经 `/workbench/*`（fs）和 `/git/*`（git）暴露，外加一条
  `/workbench/events` SSE 流。
- **浏览器侧**（`src/client`）：一个 DOM 布局控制器把 shell 的 3 栏网格扩展成 5 栏
  （Preview + 工作台面板）、两个 React 根，以及无框架的 store
  （layout / explorer / scm / preview / git）。
- 上游两个 git 服务（dsh-aionui-panel 的变更 + dsh-git-graph 的分支/图谱/切换）被
  合并成一个服务：一个门控、一个仓库缓存、一次合并的操作标记探测（1 次 git spawn，
  而非 7 次）。

## 安装

从源码（本地）：

```sh
dsh plugin --profile web add link:<path-to-this-repo>
```

~~从 npm（发布后）：`dsh plugin --profile web add @doebkblcya/dsh-workbench`~~

## 构建

```sh
npm install
npm run build   # tsc -b && tsdown → lib/index.js + lib/client.js
```

## 许可与署名

BSD-3-Clause。本包是 dsh-web-ui monorepo（https://github.com/zhu1090093659/dsh-web-ui）
的衍生作品——具体是 `dsh-aionui-panel` 和 `dsh-git-graph`（均 0.1.15）。右侧面板设计
本身重新实现了 AionUi（iOfficeAI/AionUi，Apache-2.0）。完整署名见
[`LICENSE`](./LICENSE) 和 [`NOTICE`](./NOTICE)。

> 说明：上游 `package.json` 元数据写的是 `Apache-2.0`，而包里实际发布的 `LICENSE`
> 文件是 `BSD-3-Clause`（仓库根 LICENSE 才是 Apache-2.0）。本 fork 遵循实际发布的包
> 许可证（BSD-3-Clause）；两者皆为宽松许可证，衍生开发无论哪种都合规。
