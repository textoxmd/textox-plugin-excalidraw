# textox-plugin-excalidraw

Textox 的 Excalidraw 插件：在 Markdown 里嵌入白板引用（`![](xxx.excalidraw)`），并提供 `.excalidraw` 文件的自定义编辑器（新建 / 打开 / 保存）。插件 id 为 `app.textox.excalidraw`。

本仓库是 Textox 主仓库（`official-v1-plugins/excalidraw`）迁出的独立仓库，产物是可直接安装的插件 zip。

## 环境要求

- [Bun](https://bun.sh)（构建与测试都走 Bun）
- 同级目录下有 Excalidraw fork 的 checkout：`../excalidraw`（`textoxmd/excalidraw`，`textox-0.18.1` 分支）。**该 fork 必须已经构建过**，`packages/excalidraw/dist/` 需要同时有 `dev`、`prod` 与 `types`（fork 的 `packages/excalidraw/.gitignore` 忽略 `dist/types`，新 clone 后要先跑一次 fork 的 types 构建）。

## 开发

```sh
bun install
bun run typecheck   # tsc --noEmit
bun run test        # vitest（happy-dom）
bun run build       # 构建到 dist/
bun run dev         # 构建一次（运行期改动需重启宿主）
```

## 构建产物

`bun run build` 产出：

```
dist/main.js          # 单文件 bundle（动态 import 已内联）
dist/manifest.json    # 由 plugin.config.ts 生成，含 builtAgainst
dist/styles.css       # 插件样式
```

`bun run pack` 在构建后再打包成插件包：

```
dist/app.textox.excalidraw-1.0.0.zip
```

zip 内是 `<id>/` 目录下的三个文件（`manifest.json`、`main.js`、`styles.css`），即 Textox 插件安装格式。

## 安装到 Textox

产物是插件 zip，用 Textox 自带的插件 CLI 安装（在主仓库目录下运行，`plugin:cli` 走 Rust `plugin-cli`）：

```sh
# 在 Textox 主仓库里
bun run plugin:cli -- install /path/to/app.textox.excalidraw-1.0.0.zip
bun run plugin:cli -- enable app.textox.excalidraw     # 启用（第三方/未启用插件需手动启用）
bun run plugin:cli -- list                             # 查看已安装
bun run plugin:cli -- uninstall app.textox.excalidraw  # 卸载
```

安装/启用后需重启 Textox 生效。安全模式（safe mode）下只会自动加载 `app.textox.*`，本插件属于该前缀。

## 依赖说明

- **`@textox/plugin-sdk`**：来自 npm（`^0.1.0`），是插件与宿主之间的契约包。构建时由 `@textox/plugin-build` 按 `SHARED_MODULES` 保持外部化，产物里只留 `import { Plugin } from "@textox/plugin-sdk"`，**不会**内联第二份契约包。
- **`@excalidraw/*`**：指向同级 fork checkout 的本地路径（`file:../excalidraw/packages/*`），不是 npm 上的上游包。`package.json` 的 `overrides` 同样指向本地路径，因为 fork 的包之间用 `0.18.0` 版本互引。升级 fork 时两处要一起改。

> ⚠️ **临时依赖**：构建工具 `@textox/plugin-build` **尚未发布到 npm**，当前以本地路径依赖引入：
> `"@textox/plugin-build": "file:../../Textox/packages/plugin-build"`。
> 这意味着构建/打包需要同机存在 Textox 主仓库 checkout（且已 `bun install`）。等 `@textox/plugin-build` 发布后，把这一行改成版本号（如 `"^0.1.0"`）即可，其余不用动。

## 契约与运行时

插件继承 `@textox/plugin-sdk` 的 `Plugin` 基类，生命周期由宿主驱动：加载模块 → `new` → `onload()`；停用时先 `onunload()`，宿主 `await` 后再 `dispose()`。本插件在 `onload()` 里注册一条命令（新建白板）、一个嵌入预览（白板引用）、一个文件编辑器（`.excalidraw`）。

## 许可

MIT，见 [LICENSE](./LICENSE)。
