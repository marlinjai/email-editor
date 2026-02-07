// examples/nextjs/app/api/templates/route.ts
// List all saved templates

import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { EmailTemplate } from '@returnhypnosis/email-editor-core';

export interface SavedTemplateInfo {
  id: string;
  name: string;
  updatedAt: string;
  sectionCount: number;
  previewColors: string[]; // First few section background colors for visual preview
}

/**
 * GET /api/templates
 * List all saved templates with metadata
 */
export async function GET() {
  try {
    const templatesDir = join(process.cwd(), 'saved-templates');
    
    let files: string[];
    try {
      files = await readdir(templatesDir);
    } catch {
      // Directory doesn't exist yet - return empty list
      return NextResponse.json({ templates: [] });
    }

    // Filter for JSON files only
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    // Load metadata for each template
    const templates: SavedTemplateInfo[] = await Promise.all(
      jsonFiles.map(async (fileName) => {
        const filePath = join(templatesDir, fileName);
        const [fileContent, fileStat] = await Promise.all([
          readFile(filePath, 'utf-8'),
          stat(filePath),
        ]);

        const template: EmailTemplate = JSON.parse(fileContent);
        
        // Extract preview colors from first 3 sections
        const previewColors = template.sections
          .slice(0, 3)
          .map((s) => s.backgroundColor || '#f5f5f5');

        return {
          id: fileName.replace('.json', ''),
          name: template.metadata?.title || fileName.replace('.json', ''),
          updatedAt: fileStat.mtime.toISOString(),
          sectionCount: template.sections.length,
          previewColors,
        };
      })
    );

    // Sort by most recently updated
    templates.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json(
      { error: 'Failed to list templates' },
      { status: 500 }
    );
  }
}

