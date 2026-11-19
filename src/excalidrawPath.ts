// Excalidraw 围栏块路径解析：与图片路径（resolveImageSrc）同一套判定规则，
// 但只接受本地文件系统路径（相对文档目录 / 绝对路径）。

function isWindowsAbsolute(src: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(src);
}

function isRemoteOrNonFs(src: string): boolean {
  return (
    src.startsWith("data:") ||
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("blob:") ||
    src.startsWith("tauri://") ||
    src.startsWith("asset://") ||
    src.startsWith("://")
  );
}

/**
 * 将围栏块中的白板路径解析为绝对文件系统路径。
 * - 相对路径以文档目录为基准
 * - 绝对路径（POSIX 或 Windows 盘符）直接使用
 * - 无文档目录时返回 null（调用方显示占位提示）
 * - 远程 URL / data URL 等非本地路径返回 null
 */
export function resolveExcalidrawPath(
  src: string,
  documentDir: string | null,
): string | null {
  const trimmed = src.trim();
  if (!trimmed || isRemoteOrNonFs(trimmed)) return null;
  if (trimmed.startsWith("/") || isWindowsAbsolute(trimmed)) return trimmed;
  if (!documentDir) return null;
  return `${documentDir.replace(/\\/g, "/").replace(/\/+$/, "")}/${trimmed}`;
}
