// packages/core/src/history/HistoryManager.ts
// Undo/redo state management using Immer

import { produce, Draft } from 'immer';

/**
 * History manager for undo/redo functionality
 * Uses Immer for immutable state updates
 */
export class HistoryManager<T> {
  private history: T[] = [];
  private currentIndex = -1;
  private maxHistorySize: number;

  constructor(initialState: T, maxHistorySize = 50) {
    this.maxHistorySize = maxHistorySize;
    this.history.push(initialState);
    this.currentIndex = 0;
  }

  /**
   * Get current state
   */
  getCurrentState(): T {
    return this.history[this.currentIndex];
  }

  /**
   * Update state with a producer function (Immer)
   * Adds new state to history
   */
  updateState(producer: (draft: Draft<T>) => void): T {
    const newState = produce(this.getCurrentState(), producer);
    
    // Remove any future history if we're not at the end
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new state
    this.history.push(newState);
    
    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
      this.currentIndex = this.history.length - 1;
    } else {
      this.currentIndex++;
    }

    return newState;
  }

  /**
   * Replace current state without affecting history
   */
  replaceState(newState: T): void {
    this.history[this.currentIndex] = newState;
  }

  /**
   * Undo to previous state
   */
  undo(): T | null {
    if (!this.canUndo()) {
      return null;
    }
    this.currentIndex--;
    return this.getCurrentState();
  }

  /**
   * Redo to next state
   */
  redo(): T | null {
    if (!this.canRedo()) {
      return null;
    }
    this.currentIndex++;
    return this.getCurrentState();
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Clear all history and set new initial state
   */
  reset(initialState: T): void {
    this.history = [initialState];
    this.currentIndex = 0;
  }

  /**
   * Get history size
   */
  getHistorySize(): number {
    return this.history.length;
  }

  /**
   * Get current index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }
}

/**
 * Create a new history manager
 */
export function createHistoryManager<T>(
  initialState: T,
  maxHistorySize = 50
): HistoryManager<T> {
  return new HistoryManager(initialState, maxHistorySize);
}

