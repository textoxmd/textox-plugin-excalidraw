import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmbedNodeLike, PluginApp } from '@textox/plugin-sdk';

import { createExcalidrawPreview } from './preview';

let buildImpl: () => HTMLElement;

vi.mock('./excalidraw-widget', () => ({
  buildExcalidrawEmbed: () => buildImpl(),
}));

function node(text: string): EmbedNodeLike {
  return { attrs: {}, textContent: text, type: 'image_ref' };
}

function app(): PluginApp {
  return {
    editor: { parseEmbedRef: (text: string) => parse(text) },
    workspace: { getDocumentDir: () => null },
    toast: { error: vi.fn(), success: vi.fn() },
  } as unknown as PluginApp;
}

function parse(text: string): { src: string; alt: string } | null {
  const match = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(text.trim());
  return match ? { src: match[2]!, alt: match[1]! } : null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createExcalidrawPreview', () => {
  it('shows an error text for an invalid reference', () => {
    const target = document.createElement('div');
    const preview = createExcalidrawPreview(app(), node('nope'));
    preview.render(target);
    expect(target.textContent).toContain('invalid excalidraw reference');
  });

  it('renders the built widget and re-renders on update', async () => {
    buildImpl = () => {
      const el = document.createElement('div');
      el.setAttribute('data-built', '1');
      return el;
    };
    const target = document.createElement('div');
    const preview = createExcalidrawPreview(app(), node('![](a.excalidraw)'));
    preview.render(target);
    await new Promise((r) => setTimeout(r, 0));
    expect(target.querySelector('[data-built]')).toBeTruthy();

    preview.update?.(node('![](b.excalidraw)'));
    await new Promise((r) => setTimeout(r, 0));
    expect(target.querySelector('[data-built]')).toBeTruthy();
    preview.destroy?.();
  });
});
