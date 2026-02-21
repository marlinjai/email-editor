import { defineConfig } from 'clearify';

export default defineConfig({
  name: 'Email Editor',
  siteUrl: 'https://docs.email-editor.lumitra.co',
  sections: [
    { label: 'Documentation', docsDir: './docs/public' },
    { label: 'Internal', docsDir: './docs/internal', basePath: '/internal', draft: true },
  ],
  mermaid: {
    strategy: 'client',
  },
});
