// 仅做 `![](src)` 判定，无模块级副作用——让插件清单可以在启动时静态引用，
// 而不必因此把 embed widget（含 listen / MutationObserver 等副作用）一起加载。

const REMOTE_SRC_RE = /^(?:https?:|data:|blob:|tauri:|asset:|\/\/)/i;

/**
 * `![](src)` 是否应作为白板引用处理：扩展名为 `.excalidraw` 且为本地文件
 * 系统路径（远程 / data / blob 等一律按普通图片/链接处理）。
 */
export function isExcalidrawRef(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed.toLowerCase().endsWith(".excalidraw")) return false;
  return !REMOTE_SRC_RE.test(trimmed);
}
