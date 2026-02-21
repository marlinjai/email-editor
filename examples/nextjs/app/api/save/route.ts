// examples/nextjs/app/api/save/route.ts
// Save template and compile MJML

import { NextRequest, NextResponse } from 'next/server';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';
import type { EmailTemplate } from '@marlinjai/email-editor-core';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * POST /api/save
 * Save EmailTemplate and compile to MJML/HTML
 */
export async function POST(request: NextRequest) {
  try {
    const template: EmailTemplate = await request.json();

    // Validate template
    if (!template || template.version !== '1.0') {
      return NextResponse.json(
        { success: false, error: 'Invalid template format' },
        { status: 400 }
      );
    }

    // Compile template
    const compiler = createMJMLCompiler();
    const result = compiler.compile(template);

    if (result.errors && result.errors.length > 0) {
      return NextResponse.json({
        success: false,
        errors: result.errors,
      });
    }

    // Save template to disk (in development)
    try {
      const templatesDir = join(process.cwd(), 'saved-templates');
      await mkdir(templatesDir, { recursive: true });

      const fileName = template.metadata.title
        ? `${template.metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`
        : `template_${Date.now()}.json`;

      const filePath = join(templatesDir, fileName);

      await writeFile(
        filePath,
        JSON.stringify(template, null, 2),
        'utf-8'
      );

      // Also save compiled HTML
      const htmlPath = join(templatesDir, fileName.replace('.json', '.html'));
      await writeFile(htmlPath, result.html, 'utf-8');

      console.log('Template saved to:', filePath);
    } catch (saveError) {
      console.error('Error saving to disk:', saveError);
      // Don't fail the request if disk save fails
    }

    // Return success with compiled output
    return NextResponse.json({
      success: true,
      mjml: result.mjml,
      html: result.html,
      template,
    });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

