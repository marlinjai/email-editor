// packages/ui/src/DeleteWrapperDialog.tsx
// Asks, in the editor's own dialog, what deleting a container means for the sections inside it

import React from 'react';
import { observer } from 'mobx-react-lite';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { useStore } from './store';
import { useEditorHost } from './host/EditorHostContext';

/**
 * Opens while `editorUI.pendingWrapperDeleteId` names a wrapper (the Delete
 * key, the canvas toolbar, the inspector and the Layers panel all ask through
 * it). A container with sections offers to keep them (they take its place) or
 * to delete everything; an empty one just asks to confirm. Escape, the
 * overlay and Cancel leave the document as it is. Either delete is one undo
 * step.
 */
export const DeleteWrapperDialog = observer(function DeleteWrapperDialog() {
  const { template, editorUI } = useStore();
  const { portalContainer } = useEditorHost();
  const id = editorUI.pendingWrapperDeleteId;
  const wrapper = id ? template.getWrapperById(id) : undefined;
  const count = wrapper?.sections.length ?? 0;

  const close = () => editorUI.cancelWrapperDelete();
  const remove = (keepSections: boolean) => {
    if (!wrapper) return close();
    const firstSection = wrapper.sections[0]?.id;
    template.removeWrapper(wrapper.id, { keepSections });
    editorUI.cancelWrapperDelete();
    if (keepSections && firstSection) editorUI.selectSection(firstSection);
    else editorUI.clearSelection();
  };

  return (
    <Dialog.Root open={Boolean(wrapper)} onOpenChange={(open) => (open ? undefined : close())}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className={clsx(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[min(440px,92vw)] rounded-xl bg-canvas-2 p-6 shadow-2xl ring-1 ring-black/10'
          )}
        >
          <Dialog.Title className="text-base font-semibold text-text-dark">Delete this container?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-dark-muted">
            {count === 0
              ? 'It is empty. Its background, border and padding go with it.'
              : `It holds ${count === 1 ? 'one section' : `${count} sections`}. Keep ${count === 1 ? 'it' : 'them'} in its place without the container's styling, or delete everything. You can undo either.`}
          </Dialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="px-3 py-1.5 text-sm rounded border border-border-light text-text-dark hover:bg-canvas-1">
                Cancel
              </button>
            </Dialog.Close>
            {count > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => remove(false)}
                  className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50"
                >
                  Delete everything
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => remove(true)}
                  className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent-hover"
                >
                  Keep the sections
                </button>
              </>
            ) : (
              <button
                type="button"
                autoFocus
                onClick={() => remove(false)}
                className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete container
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
