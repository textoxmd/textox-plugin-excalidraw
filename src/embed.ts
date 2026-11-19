import type { EmbedBridgeOptions, PluginApp } from '@textox/plugin-sdk';

import { createExcalidrawPreview } from './embed/preview';
import { isExcalidrawRef } from './embed/ref';

/** 白板嵌入桥：`.excalidraw` 本地引用的预览渲染。 */
export function createEmbedRegistration(app: PluginApp): EmbedBridgeOptions {
  return {
    id: 'app.textox.excalidraw.embed',
    extensions: ['.excalidraw'],
    insertLabelKey: 'insertLabel',
    matches: isExcalidrawRef,
    createPreview: (node) => createExcalidrawPreview(app, node),
  };
}
