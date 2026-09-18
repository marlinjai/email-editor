// examples/nextjs/app/api/compile/route.ts
// Server-side MJML compilation for the demo editor

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';
import { migrateTemplate, isTemplateMigrationError, type EmailTemplate } from '@marlinjai/email-editor-core';

/**
 * POST /api/compile
 * Compile an EmailTemplate to MJML and HTML.
 *
 * Body: the EmailTemplate JSON, or `{ template: EmailTemplate }`.
 *
 * This route is the demo's own compiler, with no keys and no metering. A real
 * host that sends mail uses the mail service's compile API instead
 * (`POST /v1/compile` through `@marlinjai/mail-sdk`), which authenticates the
 * workspace and runs the compiler off the request thread.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'The request body is not valid JSON.' }, { status: 400 });
  }

  const rawTemplate: unknown =
    typeof body === 'object' && body !== null && 'template' in body ? (body as { template: unknown }).template : body;

  // Validate the document and bring it to the schema version this build
  // compiles. A newer document (from a newer editor) or an invalid one is
  // the caller's error, with a code it can act on.
  let template: EmailTemplate;
  try {
    template = migrateTemplate(rawTemplate);
  } catch (error) {
    if (isTemplateMigrationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, issues: error.issues },
        { status: error.code === 'NEWER_VERSION' ? 422 : 400 }
      );
    }
    console.error('Compilation error:', error);
    return NextResponse.json({ success: false, error: 'Unexpected error while reading the template.' }, { status: 500 });
  }

  const result = createMJMLCompiler().compile(template);
  if (result.errors && result.errors.length > 0) {
    return NextResponse.json({ success: false, mjml: result.mjml, errors: result.errors });
  }
  return NextResponse.json({ success: true, mjml: result.mjml, html: result.html });
}

/**
 * GET /api/compile
 * Describes the route.
 */
export async function GET() {
  return NextResponse.json({
    name: 'Email Editor demo compile route',
    endpoints: {
      'POST /api/compile': {
        description: 'Compile an EmailTemplate to MJML and HTML',
        body: 'EmailTemplate JSON, or { template: EmailTemplate }',
        response: {
          success: 'boolean',
          html: 'Compiled HTML string (when success)',
          mjml: 'Generated MJML string',
          errors: 'MJML errors (when not success)',
          code: 'migrateTemplate error code, when the document was rejected',
        },
      },
    },
  });
}
