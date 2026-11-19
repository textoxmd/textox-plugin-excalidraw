import { describe, expect, it } from "vitest";
import { resolveExcalidrawPath } from "./excalidrawPath";

describe("resolveExcalidrawPath", () => {
  it("resolves relative paths against the document directory", () => {
    expect(resolveExcalidrawPath("drawings/flow.excalidraw", "/Users/u/Documents/notes"))
      .toBe("/Users/u/Documents/notes/drawings/flow.excalidraw");
  });

  it("resolves relative paths with trailing slashes in the document dir", () => {
    expect(resolveExcalidrawPath("a.excalidraw", "/Users/u/Documents/notes/"))
      .toBe("/Users/u/Documents/notes/a.excalidraw");
  });

  it("keeps POSIX absolute paths as-is", () => {
    expect(resolveExcalidrawPath("/Users/u/whiteboards/flow.excalidraw", "/Users/u/Documents/notes"))
      .toBe("/Users/u/whiteboards/flow.excalidraw");
  });

  it("keeps Windows drive absolute paths as-is", () => {
    expect(resolveExcalidrawPath("C:\\whiteboards\\flow.excalidraw", "D:\\notes"))
      .toBe("C:\\whiteboards\\flow.excalidraw");
  });

  it("returns null for relative paths without a document directory", () => {
    expect(resolveExcalidrawPath("drawings/flow.excalidraw", null)).toBeNull();
  });

  it("returns null for remote or data URLs", () => {
    expect(resolveExcalidrawPath("https://example.com/a.excalidraw", "/Users/u/Documents/notes"))
      .toBeNull();
    expect(resolveExcalidrawPath("data:application/json,{}", "/Users/u/Documents/notes"))
      .toBeNull();
  });

  it("returns null for empty content", () => {
    expect(resolveExcalidrawPath("", "/Users/u/Documents/notes")).toBeNull();
    expect(resolveExcalidrawPath("   ", "/Users/u/Documents/notes")).toBeNull();
  });
});
