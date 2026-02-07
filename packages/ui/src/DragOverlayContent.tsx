// packages/ui/src/DragOverlayContent.tsx
// Drag overlay visual during drag operations

import React from 'react';
import {
  Type,
  Image,
  Square,
  Minus,
  Space,
  Share2,
  List,
  Code,
  Layout,
  Navigation,
  GalleryHorizontal,
  Table2,
} from 'lucide-react';

interface DragOverlayContentProps {
  item: {
    type: 'block' | 'template';
    id: string;
    label: string;
  };
}

const BLOCK_ICONS: Record<string, typeof Type> = {
  text: Type,
  image: Image,
  button: Square,
  divider: Minus,
  spacer: Space,
  social: Share2,
  accordion: List,
  raw: Code,
  navbar: Navigation,
  carousel: GalleryHorizontal,
  table: Table2,
};

export function DragOverlayContent({ item }: DragOverlayContentProps) {
  const Icon = item.type === 'block' ? (BLOCK_ICONS[item.id] || Layout) : Layout;

  return (
    <div className="bg-white px-4 py-3 rounded-lg shadow-xl border-2 border-blue-500 flex items-center gap-3 min-w-[140px]">
      <Icon size={20} className="text-blue-500" />
      <span className="font-medium text-sm">{item.label}</span>
    </div>
  );
}
