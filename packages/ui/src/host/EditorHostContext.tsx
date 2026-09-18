// packages/ui/src/host/EditorHostContext.tsx
// Hooks the host application supplies to the editor (image picking, and later others)

import React, { createContext, useContext, useMemo } from 'react';

/**
 * What the editor tells the host when it asks for an image.
 */
export interface ImageRequest {
  /** The id of the block the image is for */
  blockId: string;
  /** The block type asking (today always `image`) */
  blockType: string;
  /** The image URL the block currently shows, if any */
  currentUrl?: string;
  /** The alt text the block currently has, if any */
  currentAlt?: string;
}

/**
 * The image the host hands back: a URL the email can load (it must be
 * publicly reachable from a recipient's mail client), and optional alt text.
 */
export interface RequestedImage {
  url: string;
  alt?: string;
}

/**
 * Called when the user asks to choose an image. Open your own picker or
 * uploader, then resolve with the chosen image, or with `null` when the user
 * cancels (the block is left unchanged). A rejected promise is shown to the
 * user as an inline error next to the button, using the error's message.
 */
export type OnRequestImage = (request: ImageRequest) => Promise<RequestedImage | null>;

export interface EditorHostHooks {
  onRequestImage?: OnRequestImage;
  /**
   * The editor's root element. Dialogs portal into it rather than into
   * `document.body`, so they stay inside the scoped stylesheet and inherit
   * the theme tokens set on the root.
   */
  portalContainer?: HTMLElement | null;
}

const EditorHostContext = createContext<EditorHostHooks>({});

export function EditorHostProvider({
  onRequestImage,
  portalContainer,
  children,
}: EditorHostHooks & { children: React.ReactNode }) {
  const value = useMemo(() => ({ onRequestImage, portalContainer }), [onRequestImage, portalContainer]);
  return <EditorHostContext.Provider value={value}>{children}</EditorHostContext.Provider>;
}

/**
 * The hooks the host supplied. Outside an editor every hook is undefined, so
 * components fall back to their built-in behavior.
 */
export function useEditorHost(): EditorHostHooks {
  return useContext(EditorHostContext);
}
