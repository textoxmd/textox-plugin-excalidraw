// 旧文件编辑器契约的结构化副本：新运行时插件不依赖 `@texto/plugin-sdk`，
// 但宿主仍按旧形状传 props，因此这里只声明用到的字段。

export interface FileEditorHandle {
  save(): Promise<{ ok: boolean; path?: string }>;
  handleExternalModify?(): void;
}

export interface FileEditorPropsLike {
  filePath: string | null;
  isTemp: boolean;
  editable: boolean;
  onModifiedChange(modified: boolean): void;
  onPathChange(path: string): void;
  handleRef: { current: FileEditorHandle | null };
}
