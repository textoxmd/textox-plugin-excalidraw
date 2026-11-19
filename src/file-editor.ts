import type { FileEditorBridgeOptions, PluginApp } from '@textox/plugin-sdk';

import { preloadExcalidraw } from './excalidraw-loader';
import { emptySceneJson } from './scene';

/** 白板文件编辑器桥：`.excalidraw` 文件的打开/新建。 */
export function createFileEditorRegistration(_app: PluginApp): FileEditorBridgeOptions {
  return {
    id: 'app.textox.excalidraw.editor',
    extensions: ['.excalidraw'],
    newFile: 'newFileLabel',
    createEmptyContent: () => emptySceneJson(),
    load: () =>
      import('./ExcalidrawFileEditor').then((m) => ({ default: m.ExcalidrawFileEditor })),
    preload: ({ singleFileMode, currentFile }) => {
      // 纯单个 Markdown 文档用不到白板，跳过预热；打开目录或白板后再预热。
      const pureSingleMarkdown =
        singleFileMode && currentFile !== null && !currentFile.toLowerCase().endsWith('.excalidraw');
      if (!pureSingleMarkdown) preloadExcalidraw();
      return Promise.resolve();
    },
    capabilities: { customSave: true, externalModify: true, exportable: false },
  };
}
