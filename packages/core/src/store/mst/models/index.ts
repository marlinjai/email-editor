// packages/core/src/store/mst/models/index.ts
// Export all MST models

export {
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
} from './BlockModel';

export {
  ColumnModel,
  createColumn,
  type ColumnInstance,
  type ColumnSnapshotIn,
  type ColumnSnapshotOut,
} from './ColumnModel';

export {
  SubColumnModel,
  createSubColumn,
  type SubColumnInstance,
  type SubColumnSnapshotIn,
  type SubColumnSnapshotOut,
} from './SubColumnModel';

export {
  SectionModel,
  createSection,
  type SectionInstance,
  type SectionSnapshotIn,
  type SectionSnapshotOut,
} from './SectionModel';

export {
  WrapperModel,
  createWrapper,
  MJML_WRAPPER_DEFAULT_PADDING,
  type WrapperInstance,
  type WrapperSnapshotIn,
  type WrapperSnapshotOut,
  type WrapperProperties,
} from './WrapperModel';

export {
  TemplateModel,
  TopLevelItemModel,
  isWrapperInstance,
  cloneSectionSnapshot,
  type TopLevelItemInstance,
  TemplateMetadataModel,
  FontDefinitionModel,
  ThemeColorModel,
  createTemplate,
  createTemplateWithDefaultSection,
  type TemplateInstance,
  type TemplateSnapshotIn,
  type TemplateSnapshotOut,
  type TemplateMetadataInstance,
} from './TemplateModel';
