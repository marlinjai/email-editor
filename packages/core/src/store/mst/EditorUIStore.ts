// packages/core/src/store/mst/EditorUIStore.ts
import { types, Instance, SnapshotIn } from 'mobx-state-tree';

/**
 * Selection types in the editor
 */
export type SelectionType = 'block' | 'section' | 'column' | null;

/**
 * Active sidebar tab
 */
export type SidebarTab = 'elements' | 'layout' | 'layers' | 'settings' | 'prebuilt' | 'saved';

/**
 * Preview device type
 */
export type PreviewDevice = 'desktop' | 'mobile';

/**
 * Drag data for tracking drag operations
 */
export interface DragData {
  blockId?: string;
  blockType?: string;
  sourceColumnId?: string;
  sourceIndex?: number;
  isNewBlock?: boolean;
}

/**
 * Drop intent for visual feedback
 */
export interface DropIntent {
  targetColumnId: string;
  targetIndex: number;
  position: 'before' | 'after' | 'inside';
}

/**
 * Resize state for tracking resize operations
 */
export interface ResizeState {
  targetId: string;
  handleType: 'width' | 'height' | 'borderRadius';
  originalValue: string;
  previewValue: string;
}

/**
 * EditorUIStore - Manages transient UI state
 *
 * This store handles editor-specific state that doesn't need to be
 * persisted or included in undo/redo history:
 * - Selection state
 * - Drag and drop state
 * - Panel visibility
 * - Preview device
 * - Hover states
 */
export const EditorUIStore = types
  .model('EditorUI', {
    // === Selection State ===
    selectedBlockId: types.maybe(types.string),
    selectedSectionId: types.maybe(types.string),
    selectedColumnId: types.maybe(types.string),

    // === Panel State ===
    activeTab: types.optional(
      types.enumeration<SidebarTab>(['elements', 'layout', 'layers', 'settings', 'prebuilt', 'saved']),
      'elements'
    ),
    showLeftPanel: types.optional(types.boolean, true),
    showRightPanel: types.optional(types.boolean, true),

    // === View Mode ===
    previewDevice: types.optional(
      types.enumeration<PreviewDevice>(['desktop', 'mobile']),
      'desktop'
    ),
    zoomLevel: types.optional(types.number, 1),
  })
  .volatile(() => ({
    // === Transient State (not persisted) ===
    hoverBlockId: undefined as string | undefined,
    hoverSectionId: undefined as string | undefined,
    hoverColumnId: undefined as string | undefined,

    // Drag state
    isDragging: false,
    dragData: undefined as DragData | undefined,
    dropIntent: undefined as DropIntent | undefined,

    // Resize state
    isResizing: false,
    resizeState: undefined as ResizeState | undefined,

    // Inline editing state
    isInlineEditing: false,
    inlineEditBlockId: undefined as string | undefined,
  }))
  .actions(self => ({
    // === Selection Actions ===

    /**
     * Select a block
     */
    selectBlock(blockId: string | null) {
      self.selectedBlockId = blockId || undefined;
      self.selectedSectionId = undefined;
      self.selectedColumnId = undefined;
    },

    /**
     * Select a section
     */
    selectSection(sectionId: string | null) {
      self.selectedSectionId = sectionId || undefined;
      self.selectedBlockId = undefined;
      self.selectedColumnId = undefined;
    },

    /**
     * Select a column
     */
    selectColumn(columnId: string | null) {
      self.selectedColumnId = columnId || undefined;
      self.selectedBlockId = undefined;
      self.selectedSectionId = undefined;
    },

    /**
     * Clear all selection
     */
    clearSelection() {
      self.selectedBlockId = undefined;
      self.selectedSectionId = undefined;
      self.selectedColumnId = undefined;
    },

    // === Hover Actions ===

    /**
     * Set hover block
     */
    setHoverBlock(blockId: string | undefined) {
      self.hoverBlockId = blockId;
    },

    /**
     * Set hover section
     */
    setHoverSection(sectionId: string | undefined) {
      self.hoverSectionId = sectionId;
    },

    /**
     * Set hover column
     */
    setHoverColumn(columnId: string | undefined) {
      self.hoverColumnId = columnId;
    },

    /**
     * Clear all hover states
     */
    clearHover() {
      self.hoverBlockId = undefined;
      self.hoverSectionId = undefined;
      self.hoverColumnId = undefined;
    },

    // === Drag Actions ===

    /**
     * Start a drag operation for an existing block
     */
    startBlockDrag(blockId: string, sourceColumnId: string, sourceIndex: number) {
      self.isDragging = true;
      self.dragData = {
        blockId,
        sourceColumnId,
        sourceIndex,
        isNewBlock: false,
      };
    },

    /**
     * Start a drag operation for a new block from the toolbar
     */
    startNewBlockDrag(blockType: string) {
      self.isDragging = true;
      self.dragData = {
        blockType,
        isNewBlock: true,
      };
    },

    /**
     * Update the drop intent during drag
     */
    setDropIntent(intent: DropIntent | undefined) {
      self.dropIntent = intent;
    },

    /**
     * End the drag operation
     */
    endDrag() {
      self.isDragging = false;
      self.dragData = undefined;
      self.dropIntent = undefined;
    },

    // === Resize Actions ===

    /**
     * Start a resize operation
     */
    startResize(targetId: string, handleType: 'width' | 'height' | 'borderRadius', originalValue: string) {
      self.isResizing = true;
      self.resizeState = {
        targetId,
        handleType,
        originalValue,
        previewValue: originalValue,
      };
    },

    /**
     * Update resize preview value
     */
    updateResizePreview(value: string) {
      if (self.resizeState) {
        self.resizeState.previewValue = value;
      }
    },

    /**
     * End resize operation (commit or cancel)
     */
    endResize() {
      self.isResizing = false;
      self.resizeState = undefined;
    },

    // === Inline Editing Actions ===

    /**
     * Start inline editing for a block
     */
    startInlineEdit(blockId: string) {
      self.isInlineEditing = true;
      self.inlineEditBlockId = blockId;
      self.selectedBlockId = blockId;
    },

    /**
     * End inline editing
     */
    endInlineEdit() {
      self.isInlineEditing = false;
      self.inlineEditBlockId = undefined;
    },

    // === Panel Actions ===

    /**
     * Set the active sidebar tab
     */
    setActiveTab(tab: SidebarTab) {
      self.activeTab = tab;
    },

    /**
     * Toggle left panel visibility
     */
    toggleLeftPanel() {
      self.showLeftPanel = !self.showLeftPanel;
    },

    /**
     * Toggle right panel visibility
     */
    toggleRightPanel() {
      self.showRightPanel = !self.showRightPanel;
    },

    /**
     * Set left panel visibility
     */
    setLeftPanelVisible(visible: boolean) {
      self.showLeftPanel = visible;
    },

    /**
     * Set right panel visibility
     */
    setRightPanelVisible(visible: boolean) {
      self.showRightPanel = visible;
    },

    // === View Actions ===

    /**
     * Set preview device
     */
    setPreviewDevice(device: PreviewDevice) {
      self.previewDevice = device;
    },

    /**
     * Toggle preview device between desktop and mobile
     */
    togglePreviewDevice() {
      self.previewDevice = self.previewDevice === 'desktop' ? 'mobile' : 'desktop';
    },

    /**
     * Set zoom level
     */
    setZoomLevel(zoom: number) {
      self.zoomLevel = Math.max(0.25, Math.min(2, zoom));
    },

    /**
     * Zoom in
     */
    zoomIn() {
      self.zoomLevel = Math.min(2, self.zoomLevel + 0.1);
    },

    /**
     * Zoom out
     */
    zoomOut() {
      self.zoomLevel = Math.max(0.25, self.zoomLevel - 0.1);
    },

    /**
     * Reset zoom to 100%
     */
    resetZoom() {
      self.zoomLevel = 1;
    },
  }))
  .views(self => ({
    /**
     * Get the current selection type
     */
    get selectionType(): SelectionType {
      if (self.selectedBlockId) return 'block';
      if (self.selectedSectionId) return 'section';
      if (self.selectedColumnId) return 'column';
      return null;
    },

    /**
     * Check if anything is selected
     */
    get hasSelection(): boolean {
      return !!(self.selectedBlockId || self.selectedSectionId || self.selectedColumnId);
    },

    /**
     * Check if a specific block is selected
     */
    isBlockSelected(blockId: string): boolean {
      return self.selectedBlockId === blockId;
    },

    /**
     * Check if a specific section is selected
     */
    isSectionSelected(sectionId: string): boolean {
      return self.selectedSectionId === sectionId;
    },

    /**
     * Check if a specific column is selected
     */
    isColumnSelected(columnId: string): boolean {
      return self.selectedColumnId === columnId;
    },

    /**
     * Check if a specific block is hovered
     */
    isBlockHovered(blockId: string): boolean {
      return self.hoverBlockId === blockId;
    },

    /**
     * Check if we're dragging an existing block
     */
    get isDraggingExistingBlock(): boolean {
      return self.isDragging && !!self.dragData && !self.dragData.isNewBlock;
    },

    /**
     * Check if we're dragging a new block from toolbar
     */
    get isDraggingNewBlock(): boolean {
      return self.isDragging && !!self.dragData && !!self.dragData.isNewBlock;
    },

    /**
     * Get the currently dragged block type (for new blocks)
     */
    get draggedBlockType(): string | undefined {
      return self.dragData?.blockType;
    },

    /**
     * Get the currently dragged block ID (for existing blocks)
     */
    get draggedBlockId(): string | undefined {
      return self.dragData?.blockId;
    },

    /**
     * Get preview width based on device
     */
    get previewWidth(): number {
      return self.previewDevice === 'desktop' ? 600 : 375;
    },

    /**
     * Check if in mobile preview mode
     */
    get isMobilePreview(): boolean {
      return self.previewDevice === 'mobile';
    },

    /**
     * Check if in desktop preview mode
     */
    get isDesktopPreview(): boolean {
      return self.previewDevice === 'desktop';
    },

    /**
     * Get zoom percentage
     */
    get zoomPercentage(): number {
      return Math.round(self.zoomLevel * 100);
    },
  }));

export type EditorUIInstance = Instance<typeof EditorUIStore>;
export type EditorUISnapshotIn = SnapshotIn<typeof EditorUIStore>;
