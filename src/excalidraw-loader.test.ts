import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  serializeAsJSON: vi.fn(() =>
    JSON.stringify({
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    }),
  ),
}));

import {
  preloadExcalidraw,
  sceneSignature,
  serializeScene,
  type ExcalidrawSceneData,
} from "./excalidraw-loader";

describe("serializeScene (official compatibility)", () => {
  it("forces canonical type/version/source fields", async () => {
    const out = JSON.parse(
      await serializeScene({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      }),
    ) as {
      type: string;
      version: number;
      source: string;
      elements: unknown[];
      appState: Record<string, unknown>;
      files: Record<string, unknown>;
    };
    expect(out.type).toBe("excalidraw");
    expect(out.version).toBe(2);
    expect(out.source).toBe("https://excalidraw.com");
    expect(Array.isArray(out.elements)).toBe(true);
    expect(out.appState).toBeDefined();
    expect(out.files).toBeDefined();
  });
});

describe("preloadExcalidraw", () => {
  it("schedules module preload via idle callback without throwing", () => {
    let idleRan = false;
    const original = (window as any).requestIdleCallback;
    (window as any).requestIdleCallback = (cb: () => void) => {
      idleRan = true;
      cb();
    };
    try {
      expect(() => preloadExcalidraw()).not.toThrow();
    } finally {
      if (original === undefined) {
        delete (window as any).requestIdleCallback;
      } else {
        (window as any).requestIdleCallback = original;
      }
    }
    expect(idleRan).toBe(true);
  });
});

describe("sceneSignature (dirty-state detection)", () => {
  const baseScene: ExcalidrawSceneData = {
    elements: [{ id: "a", type: "rectangle" } as any],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: 20,
      theme: "light",
      scrollX: 0,
      scrollY: 0,
    },
    files: {},
  };

  it("ignores theme changes (app-controlled view preference)", () => {
    const light = sceneSignature(baseScene);
    const dark = sceneSignature({
      ...baseScene,
      appState: { ...baseScene.appState, theme: "dark" },
    });
    expect(dark).toBe(light);
  });

  it("detects content-affecting appState changes", () => {
    const base = sceneSignature(baseScene);
    const bgChanged = sceneSignature({
      ...baseScene,
      appState: { ...baseScene.appState, viewBackgroundColor: "#f0f0f0" },
    });
    const gridChanged = sceneSignature({
      ...baseScene,
      appState: { ...baseScene.appState, gridSize: 40 },
    });
    expect(bgChanged).not.toBe(base);
    expect(gridChanged).not.toBe(base);
  });

  it("detects element and file changes", () => {
    const base = sceneSignature(baseScene);
    expect(
      sceneSignature({
        ...baseScene,
        elements: [{ id: "b", type: "ellipse" } as any],
      }),
    ).not.toBe(base);
    expect(
      sceneSignature({
        ...baseScene,
        files: { "file-1": {} } as any,
      }),
    ).not.toBe(base);
  });
});
