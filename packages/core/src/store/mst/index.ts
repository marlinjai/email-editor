// packages/core/src/store/mst/index.ts
// Main export for MST store - Framework agnostic

// Models
export {
  // Block
  BlockModel,
  BlockType,
  SocialLinkModel,
  NavbarLinkModel,
  CarouselImageModel,
  AccordionItemModel,
  SpacingModel,
  type BlockInstance,
  type BlockSnapshotIn,
  type BlockSnapshotOut,

  // Column
  ColumnModel,
  createColumn,
  type ColumnInstance,
  type ColumnSnapshotIn,
  type ColumnSnapshotOut,

  // Section
  SectionModel,
  createSection,
  type SectionInstance,
  type SectionSnapshotIn,
  type SectionSnapshotOut,

  // Template
  TemplateModel,
  TemplateMetadataModel,
  FontDefinitionModel,
  ThemeColorModel,
  createTemplate,
  createTemplateWithDefaultSection,
  type TemplateInstance,
  type TemplateSnapshotIn,
  type TemplateSnapshotOut,
  type TemplateMetadataInstance,
} from './models';

// Editor UI Store
export {
  EditorUIStore,
  type EditorUIInstance,
  type EditorUISnapshotIn,
  type SelectionType,
  type SidebarTab,
  type PreviewDevice,
  type DragData,
  type DropIntent,
  type ResizeState,
} from './EditorUIStore';

// Root Store (framework-agnostic parts only)
export {
  RootStore,
  createRootStore,
  createEmptyStore,
  type RootStoreInstance,
  type RootStoreSnapshotIn,
  type CreateRootStoreOptions,
} from './RootStore';

// Note: React bindings (StoreProvider, useStore, etc.) are in @marlinjai/email-editor-ui
