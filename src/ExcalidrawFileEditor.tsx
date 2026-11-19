import { useEffect, useRef } from 'react';

import {
  ExcalidrawEditor,
  type ExcalidrawEditorHandle,
} from './ExcalidrawEditor';

import type { FileEditorHandle, FileEditorPropsLike } from './types';

/**
 * 把内嵌 Excalidraw 编辑器适配为通用文件编辑器契约：
 * 通过 handleRef 暴露保存（返回 { ok }）与外部修改处理。
 */
export function ExcalidrawFileEditor(props: FileEditorPropsLike) {
  const { filePath, isTemp, editable, onModifiedChange, onPathChange, handleRef } = props;
  const innerRef = useRef<ExcalidrawEditorHandle | null>(null);

  useEffect(() => {
    const handle: FileEditorHandle = {
      save: async () => ({ ok: (await innerRef.current?.save()) ?? false }),
      handleExternalModify: () => innerRef.current?.handleExternalModify(),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  });

  return (
    <ExcalidrawEditor
      ref={innerRef}
      filePath={filePath}
      isTemp={isTemp}
      editable={editable}
      onModifiedChange={onModifiedChange}
      onPathChange={onPathChange}
    />
  );
}
