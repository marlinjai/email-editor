// packages/core/src/selection/SelectionManager.ts
// Manages selected block/section state

/**
 * Selection state
 */
export interface SelectionState {
  blockId: string | null;
  sectionId: string | null;
}

/**
 * Selection manager for tracking what's currently selected
 */
export class SelectionManager {
  private state: SelectionState = {
    blockId: null,
    sectionId: null,
  };
  private listeners: Array<(state: SelectionState) => void> = [];

  /**
   * Get current selection
   */
  getSelection(): SelectionState {
    return { ...this.state };
  }

  /**
   * Select a block
   */
  selectBlock(blockId: string, sectionId: string): void {
    this.state = { blockId, sectionId };
    this.notify();
  }

  /**
   * Select a section
   */
  selectSection(sectionId: string): void {
    this.state = { blockId: null, sectionId };
    this.notify();
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.state = { blockId: null, sectionId: null };
    this.notify();
  }

  /**
   * Subscribe to selection changes
   */
  subscribe(listener: (state: SelectionState) => void): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify all listeners
   */
  private notify(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }
}

/**
 * Create a new selection manager
 */
export function createSelectionManager(): SelectionManager {
  return new SelectionManager();
}

