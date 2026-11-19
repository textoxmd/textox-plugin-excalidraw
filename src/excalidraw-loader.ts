// 官方 @excalidraw/excalidraw API 的唯一入口。
// 所有官方调用（编辑器组件、exportToSvg、serializeAsJSON）都收口在这里，
// 便于锁定版本、隔离上游 API 漂移，并通过动态 import 拆出独立 chunk。
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type { AppState, BinaryFiles, ExcalidrawElement };

/** 场景载荷：.excalidraw 文件 / markdown 围栏块承载的同一份官方 JSON 内容 */
export interface ExcalidrawSceneData {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

type ExcalidrawModule = typeof import("@excalidraw/excalidraw");

let modPromise: Promise<ExcalidrawModule> | null = null;

/** 懒加载官方模块（Vite 会拆出独立 chunk，不进入主包） */
export function loadExcalidraw(): Promise<ExcalidrawModule> {
  if (!modPromise) {
    modPromise = import("@excalidraw/excalidraw");
  }
  return modPromise;
}

/**
 * 应用空闲时预热白板模块：白板 chunk（约 3MB）在启动后后台加载并解析，
 * 避免首次点击白板时才在主线程执行 import，造成点击瞬间卡顿。
 */
export function preloadExcalidraw(): void {
  const start = () => {
    loadExcalidraw().catch(() => {
      // 预热失败不阻塞启动，首次打开白板时 loadExcalidraw 会再次尝试
    });
  };
  const idle = (window as any).requestIdleCallback;
  if (typeof idle === "function") {
    idle(start, { timeout: 2000 });
  } else {
    setTimeout(start, 2000);
  }
}

/** 官方 .excalidraw 文件的规范字段 */
export const CANONICAL_EXCALIDRAW_TYPE = "excalidraw" as const;
export const CANONICAL_EXCALIDRAW_VERSION = 2;
export const CANONICAL_EXCALIDRAW_SOURCE = "https://excalidraw.com";

/** 新建白板的空场景（与 excalidraw.com 导出的结构一致） */
export function emptySceneJson(): string {
  return JSON.stringify(
    {
      type: CANONICAL_EXCALIDRAW_TYPE,
      version: CANONICAL_EXCALIDRAW_VERSION,
      source: CANONICAL_EXCALIDRAW_SOURCE,
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    },
    null,
    2,
  );
}

/** 应用语言 → Excalidraw 语言代码（Excalidraw 的 en 代码为 "en"） */
const EXCALIDRAW_LANG_MAP: Record<string, string> = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  "en-US": "en",
  "ja-JP": "ja-JP",
  "ko-KR": "ko-KR",
  "fr-FR": "fr-FR",
  "de-DE": "de-DE",
  "es-ES": "es-ES",
  "pt-PT": "pt-PT",
  "it-IT": "it-IT",
  "ru-RU": "ru-RU",
  "ar-SA": "ar-SA",
  "hi-IN": "hi-IN",
  "th-TH": "th-TH",
  "vi-VN": "vi-VN",
};

/** 将应用语言解析为 Excalidraw langCode（未匹配时回退英文） */
export function resolveExcalidrawLang(lang: string | undefined): string {
  if (lang && EXCALIDRAW_LANG_MAP[lang]) return EXCALIDRAW_LANG_MAP[lang]!;
  return "en";
}

/** 解析并校验 .excalidraw JSON，返回场景载荷 */
export function parseScene(text: string): ExcalidrawSceneData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("invalid JSON");
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as any).elements)) {
    throw new Error("not an excalidraw scene");
  }
  const d = data as {
    elements: readonly ExcalidrawElement[];
    appState?: Partial<AppState>;
    files?: BinaryFiles;
  };
  return {
    elements: d.elements,
    appState: d.appState ?? {},
    files: d.files ?? {},
  };
}

/**
 * 序列化场景为官方兼容的 .excalidraw JSON。
 * 以官方 serializeAsJSON 的输出为基础，再强制写入规范的 type/version/source 字段，
 * 确保产物可被 excalidraw.com 与其他工具直接打开。
 */
export async function serializeScene(scene: ExcalidrawSceneData): Promise<string> {
  const mod = await loadExcalidraw();
  const raw = JSON.parse(
    mod.serializeAsJSON(scene.elements, scene.appState, scene.files, "local"),
  ) as {
    elements?: readonly ExcalidrawElement[];
    appState?: Partial<AppState>;
    files?: BinaryFiles;
  };
  return JSON.stringify(
    {
      type: CANONICAL_EXCALIDRAW_TYPE,
      version: CANONICAL_EXCALIDRAW_VERSION,
      source: CANONICAL_EXCALIDRAW_SOURCE,
      elements: raw.elements ?? [],
      appState: raw.appState ?? {},
      files: raw.files ?? {},
    },
    null,
    2,
  );
}

/**
 * 场景签名：用于判断是否发生实质性修改。
 * 只比较 elements/files 与少量影响内容的 appState 字段，
 * 避免滚动、缩放、选中状态等视口变化被误判为未保存修改。
 * theme 不参与签名：嵌入模式下主题完全由应用控制（画布内切换按钮
 * 已禁用，加载时强制使用应用主题），切换应用主题只是视图偏好变化，
 * 不应把文件标记为未保存。
 */
export function sceneSignature(scene: ExcalidrawSceneData): string {
  const appState = scene.appState as Partial<AppState>;
  return JSON.stringify({
    elements: scene.elements,
    files: scene.files,
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
  });
}

/** 渲染场景为 SVG（静态预览 / 打印） */
export async function renderSceneToSvg(
  scene: ExcalidrawSceneData,
  theme: "light" | "dark",
): Promise<SVGSVGElement> {
  const mod = await loadExcalidraw();
  return mod.exportToSvg({
    // 官方类型要求 NonDeleted 元素；解析自文件的元素在渲染前无需过滤，
    // 由官方 exportToSvg 内部处理，这里做一次类型收窄。
    elements: scene.elements as any,
    // exportToSvg 以 exportWithDarkMode 决定暗色导出（appState.theme 不参与），
    // 暗色时必须开启，元素（含文字）颜色才会做反色过滤（黑字 → 近白），
    // 否则黑字会落在透明/暗色容器上无法辨认。
    // 暗色模式下不导出画布背景（exportBackground=false）：让预览容器
    // 的 var(--background) 主题底色透出，避免白板文件的 viewBackgroundColor
    // 被 Excalidraw 调暗后与编辑器主题色不一致。亮色模式保留文件画布色。
    appState: {
      ...scene.appState,
      theme,
      exportWithDarkMode: theme === "dark",
      exportBackground: theme === "light",
    },
    files: scene.files,
    exportPadding: 8,
    // 预览/打印不内联网络字体，避免沙盒环境下拉取字体失败；
    // SVG 使用字体族名，由系统字体回退渲染。
    skipInliningFonts: true,
    // 内嵌网页（embeddable）在静态导出中不可用，保持占位即可
    renderEmbeddables: false,
  });
}
