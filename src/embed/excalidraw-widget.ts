// `![](path.excalidraw)` 白板引用的预览渲染器。
//
// 白板不是 <img>（MIME 非图片），而是读取本地 .excalidraw 文件 → 官方解析
// → exportToSvg 输出静态 SVG。由 image_ref 块节点（白板预览）使用：
// 构建容器（占位 + 懒加载）、渲染 SVG、缓存；白板保存（`excalidraw-saved`）
// 与主题切换时清缓存重渲。交互（点击打开、更换文件）由 NodeView 负责。

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { resolveExcalidrawPath } from "../excalidrawPath";
import { parseScene, renderSceneToSvg } from "../excalidraw-loader";
import "./excalidraw.css";

export { isExcalidrawRef } from "./ref";

const svgCache = new Map<string, string>();

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

function cacheKey(theme: "light" | "dark", resolvedPath: string): string {
  return `${theme}::${resolvedPath}`;
}

function clearCacheForPath(path: string): void {
  const norm = path.replace(/\\/g, "/");
  for (const key of svgCache.keys()) {
    if (key.endsWith(`::${norm}`) || key.includes(`::${norm}/`)) {
      svgCache.delete(key);
    }
  }
}

/** 清空 embed SVG 缓存；给定路径时只清该文件相关项。 */
export function clearEmbedCache(path?: string): void {
  if (path) clearCacheForPath(path);
  else svgCache.clear();
}

function showError(el: HTMLElement, message: string): void {
  el.classList.remove("excalidraw-embed-empty");
  el.classList.add("excalidraw-embed-error");
  el.textContent = message;
}

/** 读文件 → 解析场景 → 渲染 SVG（带缓存），结果写入 embed 容器。 */
export async function renderEmbed(el: HTMLElement): Promise<void> {
  const src = el.dataset.src ?? "";
  const documentDir = el.dataset.dir ? el.dataset.dir : null;
  const resolved = resolveExcalidrawPath(src, documentDir);
  if (!resolved) {
    showError(el, "No document path — save the document first");
    return;
  }

  const theme = isDarkMode() ? "dark" : "light";
  const key = cacheKey(theme, resolved);
  if (import.meta.env.DEV) {
    console.log("[excalidraw-embed] render start:", resolved);
  }
  let html = svgCache.get(key);
  if (!html) {
    try {
      const text = await invoke<string>("read_file", { path: resolved });
      const scene = parseScene(text);
      const svg = await renderSceneToSvg(scene, theme);
      html = svg.outerHTML;
      svgCache.set(key, html);
    } catch (err) {
      console.error("[excalidraw-embed] render failed:", err);
      showError(
        el,
        `Cannot render: ${String((err as Error)?.message ?? err)}`,
      );
      return;
    }
  }
  el.dataset.rendered = "1";
  el.classList.remove("excalidraw-embed-error", "excalidraw-embed-empty");
  el.innerHTML = html;
}

const liveEmbeds = new Set<HTMLElement>();

export function refreshRenderedEmbeds(): void {
  for (const el of liveEmbeds) {
    if (!el.isConnected) {
      liveEmbeds.delete(el);
      continue;
    }
    // 未渲染的容器：缓存已清，重新触发渲染
    if (el.dataset.rendered !== "1") continue;
    void renderEmbed(el);
  }
}

/**
 * 构建白板预览容器并立即异步渲染 SVG。
 *
 * 刻意不做 IntersectionObserver/可见性懒加载：观察者的初始回调常在元素
 * 挂载前触发（isConnected=false），加上 React StrictMode 双挂载等时序，
 * 很容易让预览永久停在 Loading。白板在单篇笔记中数量有限，文档打开时
 * 直接读取渲染是可靠且可接受的；svgCache 保证同路径只读一次。
 */
export function buildExcalidrawEmbed(
  attrs: Record<string, string>,
  documentDir: string | null,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "excalidraw-embed";
  el.setAttribute("data-src", attrs.src ?? "");
  if (documentDir) el.setAttribute("data-dir", documentDir);
  if (attrs.alt) el.setAttribute("data-alt", attrs.alt);
  if (attrs.title) el.setAttribute("data-title", attrs.title);

  const placeholder = document.createElement("div");
  placeholder.className = "excalidraw-embed-empty";
  placeholder.textContent = "Loading…";
  el.appendChild(placeholder);

  liveEmbeds.add(el);
  void renderEmbed(el);
  return el;
}

/** 供 NodeView 使用：读取容器上的 src + documentDir，解析为绝对路径。 */
export function resolveEmbedPath(el: HTMLElement): string | null {
  const src = el.dataset.src ?? "";
  const documentDir = el.dataset.dir ? el.dataset.dir : null;
  return resolveExcalidrawPath(src, documentDir);
}

// 白板保存后刷新预览：清缓存 + 重渲已渲染的 embed
if (typeof window !== "undefined") {
  try {
    listen<{ path: string }>("excalidraw-saved", (event) => {
      if (event.payload?.path) clearEmbedCache(event.payload.path);
      refreshRenderedEmbeds();
    }).catch(() => {});
  } catch {
    // 非 Tauri 环境（测试/浏览器演示）下不注册事件
  }
}

// 主题切换：清缓存并重渲（SVG 明暗底色不同）
if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  let lastDark = isDarkMode();
  const observer = new MutationObserver(() => {
    const isDark = isDarkMode();
    if (isDark !== lastDark) {
      lastDark = isDark;
      clearEmbedCache();
      refreshRenderedEmbeds();
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}
