// packages/ui/src/index.ts
// Email Editor UI Package

// Main editor component
export { EmailEditor, type EmailEditorProps } from './EmailEditor';

// Host hooks (image picking)
export {
  EditorHostProvider,
  useEditorHost,
  type EditorHostHooks,
  type ImageRequest,
  type RequestedImage,
  type OnRequestImage,
} from './host/EditorHostContext';

// Store bindings (React-specific)
export * from './store';

// Renderer components
export * from './renderer';

// Inspector components
export * from './inspector';

// Sidebar components
export * from './sidebar';

// Drag overlay
export { DragOverlayContent } from './DragOverlayContent';
