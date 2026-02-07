// examples/nextjs/app/api/templates/[id]/route.ts
// Load and delete individual templates

import { NextRequest, NextResponse } from 'next/server';
import { readFile, unlink, access } from 'fs/promises';
import { join } from 'path';
import type { EmailTemplate } from '@returnhypnosis/email-editor-core';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/templates/[id]
 * Load a specific template by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const templatesDir = join(process.cwd(), 'saved-templates');
    const filePath = join(templatesDir, `${id}.json`);

    // Check if file exists
    try {
      await access(filePath);
    } catch {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const fileContent = await readFile(filePath, 'utf-8');
    const template: EmailTemplate = JSON.parse(fileContent);

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error loading template:', error);
    return NextResponse.json(
      { error: 'Failed to load template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[id]
 * Delete a specific template by ID
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const templatesDir = join(process.cwd(), 'saved-templates');
    const jsonPath = join(templatesDir, `${id}.json`);
    const htmlPath = join(templatesDir, `${id}.html`);

    // Check if file exists
    try {
      await access(jsonPath);
    } catch {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Delete JSON file
    await unlink(jsonPath);

    // Try to delete HTML file too (may not exist)
    try {
      await unlink(htmlPath);
    } catch {
      // HTML file may not exist, that's okay
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}

