// examples/nextjs/app/api/compile/route.ts
// Server-side MJML compilation API route with API key validation

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';
import {
  validateApiKey,
  incrementUsage,
  shouldAddWatermark,
  injectWatermark,
} from '@marlinjai/email-editor-core/server';
import type { EmailTemplate } from '@marlinjai/email-editor-core';

/**
 * POST /api/compile
 * Compile EmailTemplate to MJML and HTML
 * 
 * Headers:
 * - X-Api-Key: Your API key (optional, free tier if not provided)
 * 
 * Body:
 * - template: EmailTemplate JSON
 * - preview?: boolean (skip watermark for preview mode)
 */
export async function POST(request: NextRequest) {
  try {
    // Get API key from header or body
    const apiKey = request.headers.get('X-Api-Key') || undefined;
    const body = await request.json();
    const template: EmailTemplate = body.template || body;
    const isPreview = body.preview === true;

    // Validate API key and check rate limits
    const validation = await validateApiKey(apiKey);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error || 'Invalid API key',
        },
        { status: 401 }
      );
    }

    // Validate template format
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

    // Track usage (only for non-preview compiles)
    if (!isPreview && apiKey) {
      incrementUsage(apiKey);
    }

    // Add watermark for free tier (unless preview mode)
    let html = result.html;
    const addWatermark = !isPreview && shouldAddWatermark(validation.tier);
    if (addWatermark) {
      html = injectWatermark(html);
    }

    // Return compiled output
    return NextResponse.json({
      success: true,
      mjml: result.mjml,
      html,
      watermark: addWatermark,
      tier: validation.tier,
      usageRemaining: validation.rateLimitRemaining,
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

/**
 * GET /api/compile
 * Returns API documentation
 */
export async function GET() {
  return NextResponse.json({
    name: 'Email Editor Compile API',
    version: '1.0',
    endpoints: {
      'POST /api/compile': {
        description: 'Compile EmailTemplate to HTML',
        headers: {
          'X-Api-Key': 'Your API key (optional, free tier if not provided)',
        },
        body: {
          template: 'EmailTemplate JSON object',
          preview: 'boolean (optional, skip watermark for preview mode)',
        },
        response: {
          success: 'boolean',
          html: 'Compiled HTML string',
          mjml: 'Generated MJML string',
          watermark: 'boolean (true if watermark was added)',
          tier: 'free | pro | scale',
          usageRemaining: 'number (compiles remaining this month)',
        },
      },
    },
    tiers: {
      free: {
        compiles: '100/month',
        watermark: true,
        price: 'Free',
      },
      pro: {
        compiles: '5,000/month',
        watermark: false,
        price: '$29/month',
      },
      scale: {
        compiles: '50,000/month',
        watermark: false,
        price: '$99/month',
      },
    },
  });
}
