import { Plugin, type SettingsField } from '@textox/plugin-sdk';

import './styles.css';
import { createEmbedRegistration } from './embed';
import { createFileEditorRegistration } from './file-editor';
import { defaultLocale, locales } from './locales';

export default class ExcalidrawPlugin extends Plugin {
  static settingsFields: SettingsField[] = [];

  onload(): void {
    this.app.i18n.addMessages(locales, defaultLocale);
    this.addCommand({
      id: 'app.textox.excalidraw.new-drawing',
      name: 'Excalidraw: new drawing',
      callback: async () => {
        const { emptySceneJson } = await import('./scene');
        await this.app.documents.createNewDocument({
          content: emptySceneJson(),
          extension: 'excalidraw',
        });
      },
    });
    this.registerEmbed(createEmbedRegistration(this.app));
    this.registerFileEditor(createFileEditorRegistration(this.app));
  }
}
