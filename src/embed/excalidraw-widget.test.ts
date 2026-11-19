import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("../excalidraw-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../excalidraw-loader")>()),
  parseScene: vi.fn(() => ({ type: "excalidraw", elements: [], appState: {}, files: {} })),
  renderSceneToSvg: vi.fn(async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-test", "scene");
    return svg;
  }),
}));

import { invoke } from "@tauri-apps/api/core";
// 与下面的具名导入保持同一种说明符（带 .ts）：Vite 会把 `./x` 与 `./x.ts`
// 解析成两个模块实例，各持一份模块级 svgCache，导致清理无效。
import { clearEmbedCache } from "./excalidraw-widget.ts";
import {
  buildExcalidrawEmbed,
  isExcalidrawRef,
  renderEmbed,
} from "./excalidraw-widget.ts";

beforeEach(() => {
  // 模块级 svgCache 会跨用例留存；命中缓存时 renderEmbed 同步把 HTML 写进容器，
  // 会让「占位符」用例拿到已被替换的 DOM（shuffle 下必现）。这里覆盖全部 describe。
  clearEmbedCache();
});

describe("isExcalidrawRef", () => {
  it("accepts local .excalidraw paths (relative and absolute)", () => {
    expect(isExcalidrawRef("drawings/flow.excalidraw")).toBe(true);
    expect(isExcalidrawRef("/Users/u/whiteboards/flow.excalidraw")).toBe(true);
    expect(isExcalidrawRef("C:\\whiteboards\\flow.excalidraw")).toBe(true);
  });

  it("is case-insensitive on the extension", () => {
    expect(isExcalidrawRef("drawings/flow.EXCALIDRAW")).toBe(true);
  });

  it("rejects non-excalidraw files", () => {
    expect(isExcalidrawRef("drawings/flow.png")).toBe(false);
    expect(isExcalidrawRef("")).toBe(false);
    expect(isExcalidrawRef("  ")).toBe(false);
  });

  it("rejects remote and non-filesystem sources", () => {
    expect(isExcalidrawRef("https://example.com/a.excalidraw")).toBe(false);
    expect(isExcalidrawRef("data:application/json,{}")).toBe(false);
    expect(isExcalidrawRef("blob:http://localhost/a")).toBe(false);
    expect(isExcalidrawRef("asset://localhost/a.excalidraw")).toBe(false);
  });
});

describe("buildExcalidrawEmbed", () => {
  it("builds a placeholder container with the original src and document dir", () => {
    const el = buildExcalidrawEmbed(
      { src: "drawings/flow.excalidraw", alt: "流程图" },
      "/Users/u/Documents/notes",
    );
    expect(el.classList.contains("excalidraw-embed")).toBe(true);
    expect(el.getAttribute("data-src")).toBe("drawings/flow.excalidraw");
    expect(el.getAttribute("data-dir")).toBe("/Users/u/Documents/notes");
    expect(el.querySelector(".excalidraw-embed-empty")).not.toBeNull();
  });
});

describe("renderEmbed", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    vi.mocked(invoke).mockReset();
  });

  it("shows a placeholder when the document is not saved", async () => {
    const el = buildExcalidrawEmbed({ src: "drawings/flow.excalidraw" }, null);
    await renderEmbed(el);
    expect(el.classList.contains("excalidraw-embed-error")).toBe(true);
    expect(el.textContent).toContain("No document path");
  });

  it("renders the SVG on success", async () => {
    vi.mocked(invoke).mockResolvedValue('{"type":"excalidraw","elements":[]}');
    const el = buildExcalidrawEmbed(
      { src: "drawings/flow.excalidraw" },
      "/Users/u/Documents/notes",
    );
    await renderEmbed(el);
    expect(el.querySelector('[data-test="scene"]')).not.toBeNull();
  });

  it("shows an error placeholder when the file cannot be read", async () => {
    vi.mocked(invoke).mockImplementation(async () => {
      throw new Error("boom");
    });
    const el = buildExcalidrawEmbed(
      // 与成功用例用不同路径，避免命中模块级 SVG 缓存
      { src: "broken/flow.excalidraw" },
      "/Users/u/Documents/notes",
    );
    await renderEmbed(el);
    expect(el.classList.contains("excalidraw-embed-error")).toBe(true);
    expect(el.textContent).toContain("boom");
  });
});
