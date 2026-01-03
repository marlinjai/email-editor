// Server-side MJML compilation API route
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createMJMLCompiler } from '@returnhypnosis/email-editor-core/compiler';
import type { EmailTemplate } from '@returnhypnosis/email-editor-core';

/**
 * POST /api/compile
 * Compile EmailTemplate to MJML and HTML
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

    // Return compiled output
    return NextResponse.json({
      success: true,
      mjml: result.mjml,
      html: result.html,
    });
  } catch (error) {
    console.error('Compilation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

