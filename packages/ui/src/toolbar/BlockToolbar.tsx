// packages/ui/src/toolbar/BlockToolbar.tsx
// Block toolbar with categories and search

import { useState } from 'react';
import { Search } from 'lucide-react';
import type { BlockDefinition, BlockCategory } from '@returnhypnosis/email-editor-core';
import { BlockItem } from './BlockItem';

interface BlockToolbarProps {
  blocks: BlockDefinition[];
}

/**
 * Toolbar showing available blocks
 * Organized by category with search
 */
export function BlockToolbar({ blocks }: BlockToolbarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<BlockCategory | 'all'>('all');

  // Filter blocks by search and category
  const filteredBlocks = blocks.filter((block) => {
    const matchesSearch = block.label
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === 'all' || block.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Group blocks by category
  const categories: BlockCategory[] = ['text', 'media', 'layout', 'brand'];

  return (
    <div className="panel w-64 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-brand-border">
        <h2 className="font-semibold text-lg mb-3">Blocks</h2>

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-brand-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-opacity-50"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 p-2 border-b border-brand-border overflow-x-auto">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1 rounded text-sm whitespace-nowrap ${
            activeCategory === 'all'
              ? 'bg-brand-primary text-white'
              : 'hover:bg-gray-100'
          }`}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-3 py-1 rounded text-sm whitespace-nowrap capitalize ${
              activeCategory === category
                ? 'bg-brand-primary text-white'
                : 'hover:bg-gray-100'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredBlocks.length === 0 ? (
          <div className="text-center text-brand-text-secondary text-sm py-8">
            No blocks found
          </div>
        ) : (
          filteredBlocks.map((block) => (
            <BlockItem key={block.type} definition={block} />
          ))
        )}
      </div>
    </div>
  );
}

