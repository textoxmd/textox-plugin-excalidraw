import { describe, expect, it } from 'vitest';

import { defaultLocale, locales } from './locales';

const codeKeys = ['errorInvalidFile', 'externalModified'];
const containerKeys = [
  'pluginName', 'pluginDescription', 'newDrawing', 'newFileLabel',
  'newFileDefaultName', 'insertLabel',
];

describe('excalidraw locales', () => {
  it('defaults to en-US and covers code-only and container keys', () => {
    expect(defaultLocale).toBe('en-US');
    const messages = locales[defaultLocale]!;
    for (const key of [...codeKeys, ...containerKeys]) {
      expect(typeof messages[key], key).toBe('string');
    }
  });
});
