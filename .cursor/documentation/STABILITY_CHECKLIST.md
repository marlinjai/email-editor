# Stability Checklist

## Purpose

This checklist defines the **minimum requirements** that must be satisfied before adding new features. These items address technical debt and architectural inconsistencies that cause bugs and user frustration.

---

## Critical: Must Fix Before Feature Work

### 1. State Management Migration - COMPLETED (2026-01-04)

**Problem:** `EmailEditor.tsx` uses local `useState` instead of Zustand store.

**Impact:**
- History middleware not enforced
- Validation middleware not running
- Two sources of truth causing sync issues

**Acceptance Criteria:**
- [x] Remove `useState(template)` from EmailEditor ✓
- [x] Remove `useState(selectedBlockId/sectionId/columnId)` from EmailEditor ✓
- [x] Remove `createHistoryManager()` usage ✓
- [x] All mutations go through store actions ✓
- [x] Undo/redo uses `useEditorStore((s) => s.undo)` ✓

**Files Modified:**
- `packages/ui/src/EmailEditor.tsx`

**Actual Time:** ~3 hours

**See:** [STATE_FLOW.md](./STATE_FLOW.md)

---

### 2. Drop Zone Visibility Fix - COMPLETED (2026-01-04)

**Problem:** During drag, `CanvasDropZones` hides email preview with opaque overlay.

**Impact:**
- User loses visual context
- Can't see WHERE in email they're dropping
- Violates "Framer-like" UX requirement

**Acceptance Criteria:**
- [x] Preview content visible during drag ✓
- [x] No `bg-white/80` overlay ✓
- [x] Insertion line shows drop position ✓
- [ ] Content below shifts down to indicate gap - partial (zone expands on hover)

**Files Modified:**
- `packages/ui/src/canvas/CanvasDropZones.tsx`

**Actual Time:** ~2 hours

**See:** [CANVAS_RENDERING.md](./CANVAS_RENDERING.md)

---

### 3. Documentation Reality Check - COMPLETED (2026-01-04)

**Problem:** Documentation claims features are complete that aren't.

**Acceptance Criteria:**
- [x] ROADMAP.md phase statuses reflect actual implementation ✓
- [x] STATE_FLOW.md updated to show migration complete ✓
- [x] ARCHITECTURE.md describes actual (not target) state ✓
- [x] Created sub-documents for complex systems ✓

**Files Modified:**
- `.cursor/documentation/ROADMAP.md`
- `.cursor/documentation/STATE_FLOW.md`
- `.cursor/documentation/DND_ARCHITECTURE.md` (new)
- `.cursor/documentation/CANVAS_RENDERING.md` (new)
- `.cursor/documentation/STABILITY_CHECKLIST.md` (this file)

**Actual Time:** ~1 hour

---

## High Priority: Should Fix Soon

### 4. Canvas Selection Overlay Integration

**Problem:** Selection overlay drag handle now uses dnd-kit, but integration untested.

**Acceptance Criteria:**
- [ ] Can drag block via handle to new position
- [ ] Drop zones activate when dragging from handle
- [ ] Block moves correctly on drop

**Files to Verify:**
- `packages/ui/src/canvas/SelectionOverlay.tsx`
- `packages/ui/src/EmailEditor.tsx` (`handleMoveExistingBlock`)

---

### 5. History Integration Test

**Problem:** Even when using Zustand store, history tracking untested.

**Acceptance Criteria:**
- [ ] Add block → undo → block removed
- [ ] Move block → undo → block back in original position
- [ ] Delete section → undo → section restored
- [ ] Multiple operations → multiple undos work

---

### 6. Validation Middleware Integration

**Problem:** Validation middleware exists but never actually validates.

**Acceptance Criteria:**
- [ ] Dropping section into column shows fallback behavior
- [ ] Dropping column into column shows fallback behavior
- [ ] Invalid operations don't crash, they gracefully fallback

**Files to Verify:**
- `packages/core/src/store/middleware/validation.ts`

---

## Medium Priority: Quality Improvements

### 7. Error Boundary for Canvas

**Problem:** Errors in iframe can crash entire editor.

**Acceptance Criteria:**
- [ ] Canvas has error boundary wrapper
- [ ] Error shows helpful message, not white screen
- [ ] User can recover without page reload

---

### 8. Compilation Error Handling

**Problem:** MJML compilation errors not surfaced to user.

**Acceptance Criteria:**
- [ ] Compilation error shows in UI
- [ ] Error includes line/element information
- [ ] User can identify and fix the issue

---

### 9. Mobile Preview Accuracy

**Problem:** Mobile preview doesn't accurately show stacked columns.

**Acceptance Criteria:**
- [ ] Mobile preview shows actual stacked layout
- [ ] `mj-group` sections stay horizontal
- [ ] Responsive behavior matches email clients

---

## Deferred: Future Work

These are known issues that can wait until after stability is achieved:

- [ ] Resize handles on canvas
- [ ] Border radius handles on canvas  
- [ ] Keyboard shortcuts for undo/redo
- [ ] Copy/paste blocks
- [ ] Multi-select blocks
- [ ] Collaborative editing

---

## Verification Process

### Before Marking Item Complete

1. **Manual Testing:** Perform the specific acceptance criteria steps
2. **Build Check:** `pnpm build` passes without errors
3. **Type Check:** `pnpm typecheck` (if available) passes
4. **Browser Test:** Feature works in Chrome, Firefox, Safari

### Testing Template

Use this template for each item:

```markdown
## Item: [Name]

### Tested By: [Your name]
### Date: [Date]

### Acceptance Criteria Results:
- [x] Criteria 1 - PASS
- [ ] Criteria 2 - FAIL (reason)
- [x] Criteria 3 - PASS

### Build Status: PASS / FAIL
### Browser Tests: Chrome ✅ Firefox ✅ Safari ❓

### Notes:
[Any observations or follow-up items]
```

---

## Order of Execution

Completed sequence:

1. ~~**Documentation Update** (1-2 hours)~~ - DONE ✓
2. ~~**State Management Migration** (4-6 hours)~~ - DONE ✓
3. ~~**Drop Zone Visibility** (4-6 hours)~~ - DONE ✓
4. **History Integration Test** (1 hour) - TODO
5. **Validation Test** (1 hour) - TODO

**Actual Time Spent:** ~6 hours
**Remaining Time:** ~2 hours

---

*Last updated: 2026-01-04*

