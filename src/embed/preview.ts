import type {
  EmbedNodeLike,
  EmbedPreviewRegionLike,
  PluginApp,
} from '@textox/plugin-sdk';

/**
 * 白板预览区：懒加载 widget 并按当前 src 渲染。
 * `render` 只负责把 DOM 挂到宿主容器；`update` 用于同一块换路径时重渲染
 * （宿主不会为此重建 NodeView，必须自己实现，否则会继续显示上一个文件）。
 */
export function createExcalidrawPreview(
  app: PluginApp,
  node: EmbedNodeLike,
): EmbedPreviewRegionLike {
  const dom = document.createElement('div');
  let token = 0;

  const renderInto = (current: EmbedNodeLike): void => {
    const my = ++token;
    const ref = app.editor.parseEmbedRef(current.textContent);
    if (!ref) {
      dom.textContent = 'invalid excalidraw reference';
      return;
    }
    dom.innerHTML = '<div class="image-ref-embed-loading">Loading…</div>';
    import('./excalidraw-widget')
      .then((m) =>
        m.buildExcalidrawEmbed(
          { src: ref.src, alt: ref.alt, title: ref.title ?? '' },
          app.workspace.getDocumentDir(),
        ),
      )
      .then((el) => {
        if (my !== token) return;
        dom.innerHTML = '';
        dom.appendChild(el);
      })
      .catch((err: unknown) => {
        if (my !== token) return;
        const message = (err as Error)?.message ?? String(err);
        dom.textContent = message;
        app.toast.error(message);
      });
  };

  return {
    render(target: HTMLElement) {
      target.appendChild(dom);
      renderInto(node);
    },
    update(next: EmbedNodeLike) {
      renderInto(next);
    },
    destroy() {
      token += 1;
    },
  };
}
