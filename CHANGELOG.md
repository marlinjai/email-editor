# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Marketing landing page at `/` with indigo-themed design
- Editor moved to `/editor` route
- Clearify documentation with public and internal sections
- Cloudflare Workers deployment via OpenNext
- Custom domain: email-editor.lumitra.co
- Docs site: docs.email-editor.lumitra.co
- Platform vision and roadmap for template management, campaigns, and analytics

### Changed
- Clearify dependency switched from local link to `@marlinjai/clearify@^1.6.6`
- Documentation reorganized into `docs/public/` and `docs/internal/` sections
- Mermaid diagrams enabled via client-side strategy

## [0.0.1] - 2026-02-10

### Added
- Initial email editor platform with MJML compilation
- Core package: MobX State Tree state management, Zod schema validation, MJML compiler
- UI package: 3-panel editor (sidebar, canvas, inspector), drag-and-drop via dnd-kit
- Blocks package: 14 block types (8 with visual renderers), 35 prebuilt section templates
- Editor package: high-level API (`createEditor()`) and React wrapper (`EmailEditorReact`)
- Next.js example app with server-side MJML compilation
- Rich text editing via TipTap
- Undo/redo with Immer patches
- Device preview (desktop/mobile)
- Theming support via CSS custom properties
- Clearify docs integration
