// 嵌入式 Excalidraw 编辑器：渲染在主窗口的 Markdown 编辑器位置，
// 随 App 的 currentFile 生命周期工作（保存、临时文件另存为、外部修改检测）。
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { logger } from "./logger";
import {
  loadExcalidraw,
  parseScene,
  resolveExcalidrawLang,
  sceneSignature,
  serializeScene,
  type ExcalidrawSceneData,
} from "./excalidraw-loader";
import "./excalidraw-editor.css";
import "@excalidraw/excalidraw/index.css";

export interface ExcalidrawEditorHandle {
  /** 保存当前场景；临时文件走"另存为"对话框。返回是否保存成功。 */
  save: () => Promise<boolean>;
  /** 文件被外部修改时由 App 的文件监听转发调用 */
  handleExternalModify: () => void;
}

interface ExcalidrawEditorProps {
  filePath: string | null;
  isTemp: boolean;
  editable?: boolean;
  onModifiedChange?: (modified: boolean) => void;
  /** 另存为后通知 App 更新当前文件路径 */
  onPathChange?: (path: string) => void;
  onSaveStateChange?: (saving: boolean) => void;
}

function isExcalidrawTempPath(path: string): boolean {
  return path.includes("/textox/temp/") || path.includes("\\textox\\temp\\");
}

export const ExcalidrawEditor = forwardRef<
  ExcalidrawEditorHandle,
  ExcalidrawEditorProps
>(function ExcalidrawEditor(
  {
    filePath,
    isTemp,
    editable = true,
    onModifiedChange,
    onPathChange,
    onSaveStateChange,
  },
  ref,
) {
  const { t, i18n } = useTranslation();
  const [scene, setScene] = useState<ExcalidrawSceneData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 外部重载时强制重挂载 Excalidraw，让 initialData 真正生效 */
  const [reloadKey, setReloadKey] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const [langCode, setLangCode] = useState(() => resolveExcalidrawLang(i18n.language));

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  /** 供 loadSceneFromFile 读取最新主题，避免把 theme 放进依赖导致主题切换触发重读 */
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const originalSignatureRef = useRef<string | null>(null);
  /** 首次 onChange 的签名才是可靠基线（Excalidraw 会规范化元素/主题等字段） */
  const baselinePendingRef = useRef(true);
  const modifiedRef = useRef(false);
  const ignoreExternalRef = useRef(new Set<string>());
  const lastWriteTimeRef = useRef(0);
  const savingRef = useRef(false);
  const filePathRef = useRef<string | null>(filePath);
  const isTempRef = useRef(isTemp);
  const editableRef = useRef(editable);
  const onModifiedChangeRef = useRef(onModifiedChange);
  const onPathChangeRef = useRef(onPathChange);
  const onSaveStateChangeRef = useRef(onSaveStateChange);

  onModifiedChangeRef.current = onModifiedChange;
  onPathChangeRef.current = onPathChange;
  onSaveStateChangeRef.current = onSaveStateChange;
  filePathRef.current = filePath;
  isTempRef.current = isTemp;
  editableRef.current = editable;

  // Excalidraw 内置的 saveFileToDisk 把 Cmd/Ctrl+Shift+S 绑定为“另存为到磁盘”，
  // 且无法通过 UIOptions.canvasActions 禁用（saveFileToDisk 不是 canvasActions
  // 的直接 key）。它会绕过 Textox 自身的临时/持久文件管理，静默弹原生保存框
  // 保存 .excalidraw 文件。这里在 capture 阶段拦截该组合键并阻止传播，
  // 让白板模式下 Cmd/Ctrl+Shift+S 无副作用（导出 PDF 快捷键同键，白板不支持）。
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('keydown', onKeyDown, true);
    return () => el.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const updateModified = useCallback(
    (next: boolean) => {
      modifiedRef.current = next;
      onModifiedChangeRef.current?.(next);
    },
    [],
  );

  const collectScene = useCallback((): ExcalidrawSceneData | null => {
    const api = apiRef.current;
    if (!api) return null;
    return {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    };
  }, []);

  /** 保存当前场景；返回是否成功。临时文件走"另存为"对话框。 */
  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    const path = filePathRef.current;
    const current = collectScene();
    if (!path || !current) return false;

    savingRef.current = true;
    onSaveStateChangeRef.current?.(true);
    try {
      const content = await serializeScene(current);
      let targetPath = path;
      let temp = isTempRef.current;

      if (temp) {
        const chosen = await saveDialog({
          filters: [
            { name: "Excalidraw", extensions: ["excalidraw"] },
            { name: "All Files", extensions: ["*"] },
          ],
          defaultPath: "Untitled.excalidraw",
        });
        if (!chosen || typeof chosen !== "string") return false;
        targetPath = chosen;
      }

      ignoreExternalRef.current.add(targetPath);
      lastWriteTimeRef.current = Date.now();
      try {
        await invoke("write_file", { path: targetPath, content });
        if (temp) {
          await invoke("delete_temp_file", { path }).catch(() => {});
          temp = false;
        }
      } finally {
        setTimeout(() => ignoreExternalRef.current.delete(targetPath), 500);
      }

      filePathRef.current = targetPath;
      isTempRef.current = temp;
      originalSignatureRef.current = sceneSignature(current);
      updateModified(false);
      if (temp !== isTemp || targetPath !== path) {
        onPathChangeRef.current?.(targetPath);
      }
      try {
        await emit("excalidraw-saved", { path: targetPath });
      } catch {
        // 非 Tauri 环境忽略
      }
      return true;
    } catch (error) {
      logger.error("Failed to save excalidraw:", error);
      return false;
    } finally {
      savingRef.current = false;
      onSaveStateChangeRef.current?.(false);
    }
  }, [collectScene, updateModified]);

  /** 记录已解析场景并复位修改状态（API 已就绪时原地更新，否则交给重挂载） */
  const applyParsedScene = useCallback(
    (parsed: ExcalidrawSceneData) => {
      baselinePendingRef.current = true;
      originalSignatureRef.current = sceneSignature(parsed);
      updateModified(false);
      setScene(parsed);
      setLoadError(null);
    },
    [updateModified],
  );

  /**
   * 读取并应用场景。Excalidraw 实例已挂载时通过 updateScene 原地替换，
   * 避免每次切换白板都整实例重建（初始化 restore/history/字体等开销很大）。
   * 含内嵌图片/附件的场景例外：updateScene 不会清理编辑器内部的 files 映射，
   * 原地切换会让旧文件的二进制数据残留，因此这类场景回退到重挂载。
   */
  const loadSceneFromFile = useCallback(
    async (path: string, isCancelled?: () => boolean): Promise<void> => {
      const text = await invoke<string>("read_file", { path });
      const parsed = parseScene(text);
      if (isCancelled?.()) return;
      const api = apiRef.current;
      if (!api || api.isDestroyed) {
        // 实例尚未就绪（首次挂载或异常后），强制重挂让 initialData 生效
        setReloadKey((k) => k + 1);
        applyParsedScene(parsed);
        return;
      }
      // 当前或新场景含内嵌文件时重挂，重置内部 files 映射（含同 ID 复用场景）
      if (
        Object.keys(api.getFiles()).length > 0 ||
        Object.keys(parsed.files).length > 0
      ) {
        setReloadKey((k) => k + 1);
        applyParsedScene(parsed);
        return;
      }
      // 模块已加载，从这里取 CaptureUpdateAction 避免把 @excalidraw/element
      // 打进主包（它属于白板懒加载 chunk）
      const mod = await loadExcalidraw();
      if (isCancelled?.()) return;
      // 与 initialData 挂载路径一致：先 restore 规范化，再原地替换
      const restoredElements = mod.restoreElements(parsed.elements, null, {
        repairBindings: true,
        deleteInvisibleElements: true,
      });
      const restoredAppState = mod.restoreAppState(parsed.appState, null);
      api.history.clear();
      api.updateScene({
        elements: restoredElements,
        // 强制应用当前主题：原地更新不经过 initialData 的 theme 归一化
        //（props.theme 只在变化时重设），否则文件保存的 theme 会覆盖应用主题
        // 同理强制应用锁定的 viewModeEnabled：updateScene 直接 setState，
        // 不经过 syncActionResult 的 prop 归一化，否则文件里保存的
        // viewModeEnabled 会把锁定状态覆盖掉，导致白板与编辑器锁定不同步
        // viewBackgroundColor 同样强制为 transparent：画布背景由容器 CSS
        //（--background）统一提供，白板与编辑器内容区底色保持一致，
        // 文件里保存的画布色不再参与渲染（画布背景选择按钮已禁用）
        appState: {
          ...restoredAppState,
          theme: themeRef.current,
          viewModeEnabled: !editableRef.current,
          viewBackgroundColor: "transparent",
        } as AppState,
        captureUpdate: mod.CaptureUpdateAction.NEVER,
      });
      applyParsedScene(parsed);
    },
    [applyParsedScene],
  );

  // 加载文件（filePath 变化时）
  useEffect(() => {
    if (!filePath) {
      // 槽位隐藏时不报错（避免切回白板时闪现 error 文案），只清空场景
      setScene(null);
      return;
    }
    let disposed = false;
    (async () => {
      try {
        await loadSceneFromFile(filePath, () => disposed);
        if (disposed) return;
      } catch (error) {
        logger.error("Failed to load excalidraw file:", error);
        if (disposed) return;
        setLoadError(t("excalidraw.errorInvalidFile"));
        setScene(null);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [filePath, loadSceneFromFile, t]);

  // 主题跟随
  useEffect(() => {
    let lastDark = document.documentElement.classList.contains("dark");
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      if (isDark !== lastDark) {
        lastDark = isDark;
        setTheme(isDark ? "dark" : "light");
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // 语言跟随：应用切换语言时同步 Excalidraw 界面语言
  useEffect(() => {
    const handler = () => setLangCode(resolveExcalidrawLang(i18n.language));
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  // 外部修改由 App 的文件监听转发调用（同一窗口只有一个 Rust 监听订阅，
  // 编辑器不自建监听，避免与 App 的监听互相抢占导致事件丢失）
  const handleExternalModify = useCallback(() => {
    const path = filePathRef.current;
    if (!path) return;
    if (ignoreExternalRef.current.has(path)) return;
    // 保存后 2 秒内的事件视为自身写入（文件系统事件可能延迟到达）
    if (Date.now() - lastWriteTimeRef.current < 2000) return;
    logger.log("[Excalidraw] External modify:", path);
    if (modifiedRef.current) {
      // 有未保存修改时提示，由用户决定是否放弃当前修改重新加载
      const discard = window.confirm(t("excalidraw.externalModified"));
      if (!discard) return;
    }
    (async () => {
      try {
        await loadSceneFromFile(path);
      } catch (error) {
        logger.error("Failed to reload excalidraw file:", error);
        setLoadError(t("excalidraw.errorInvalidFile"));
      }
    })();
  }, [loadSceneFromFile, t]);

  useImperativeHandle(
    ref,
    () => ({ save, handleExternalModify }),
    [save, handleExternalModify],
  );

  // 懒加载 Excalidraw 组件
  const [ExcalidrawComp, setExcalidrawComp] = useState<ComponentType<any> | null>(null);
  useEffect(() => {
    let disposed = false;
    loadExcalidraw()
      .then((mod) => {
        if (!disposed) setExcalidrawComp(() => mod.Excalidraw);
      })
      .catch((err) => {
        logger.error("Failed to load excalidraw module:", err);
        setLoadError(t("excalidraw.errorInvalidFile"));
      });
    return () => {
      disposed = true;
    };
  }, [t]);

  return (
    <div className="excalidraw-editor-root" ref={rootRef}>
      <div className="excalidraw-editor-body">
        {loadError ? (
          <div className="excalidraw-editor-error">{loadError}</div>
        ) : !ExcalidrawComp ? (
          <div className="excalidraw-editor-loading">Loading…</div>
        ) : (
          <ExcalidrawComp
            // 切换文件时走 updateScene 原地替换，key 只用于异常后的强制重挂
            key={reloadKey}
            // scene 为 null（隐藏/未加载）时保持实例挂载，避免再次打开整实例重建
            initialData={scene ? {
              elements: scene.elements,
              // 画布背景交给容器 CSS（--background）：挂载路径同样强制透明，
              // 避免文件里的 viewBackgroundColor（默认 #ffffff）盖住主题底色
              appState: { ...scene.appState, viewBackgroundColor: "transparent" },
              files: scene.files,
            } : null}
            theme={theme}
            langCode={langCode}
            aiEnabled={false}
            name={filePath ? (filePath.split("/").pop() ?? "") : undefined}
            viewModeEnabled={!editable}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                clearCanvas: false,
                changeViewBackgroundColor: false,
                toggleTheme: false,
                saveAsImage: false,
              },
            }}
            onExcalidrawAPI={(api: ExcalidrawImperativeAPI) => {
              apiRef.current = api;
            }}
            onChange={(
              _elements: readonly ExcalidrawElement[],
              appState: AppState,
              files: BinaryFiles,
            ) => {
              const api = apiRef.current;
              if (!api) return;
              const current: ExcalidrawSceneData = {
                elements: api.getSceneElements(),
                appState,
                files,
              };
              const sig = sceneSignature(current);
              // 加载/重载后的首次 onChange 作为基线，避免规范化差异被误判为修改
              if (baselinePendingRef.current) {
                baselinePendingRef.current = false;
                originalSignatureRef.current = sig;
                updateModified(false);
                return;
              }
              const next =
                originalSignatureRef.current !== null &&
                sig !== originalSignatureRef.current;
              if (next !== modifiedRef.current) {
                updateModified(next);
              }
            }}
          />
        )}
      </div>
    </div>
  );
});

export { isExcalidrawTempPath };
