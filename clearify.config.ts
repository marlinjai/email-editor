import { defineConfig } from 'clearify';

export default defineConfig({
  name: 'Email Editor',
  siteUrl: 'https://docs.email-editor.lumitra.co',
  hubProject: {
    description: 'Visual drag-and-drop email template builder with full platform',
    status: 'active',
    icon: '✉️',
    tags: ['app', 'editor', 'email'],
    group: 'Libraries',
  },
  sections: [
    { label: 'Documentation', docsDir: './docs/public' },
    { label: 'Internal', docsDir: './docs/internal', basePath: '/internal', draft: true },
  ],
  mermaid: {
    strategy: 'client',
  },
});
