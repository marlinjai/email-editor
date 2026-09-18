import { describe, expect, it } from 'vitest';
import {
  Asset,
  AssetImport,
  CompileRequest,
  CompileResult,
  MAX_ASSET_BYTES,
  MAX_IMPORT_URL_LENGTH,
  Template,
  TemplateCreate,
  TemplateDocument,
  TemplateSummary,
  TemplateUpdate,
  TemplateVersionParams,
} from './templates';
import { TS, doc } from './test-fixtures';

const template = {
  id: 'tpl_1',
  name: 'Base',
  description: null,
  document: doc,
  version: 1,
  thumbnail_url: null,
  archived_at: null,
  created_at: TS,
  updated_at: TS,
};

describe('template document', () => {
  it('accepts schema 1.0 and keeps unknown top-level keys', () => {
    const parsed = TemplateDocument.parse({ ...doc, extra: 1 });
    expect(parsed).toMatchObject({ extra: 1 });
  });

  it('rejects an unknown schema version, missing sections, or a non-object', () => {
    expect(TemplateDocument.safeParse({ ...doc, version: '2.0' }).success).toBe(false);
    expect(TemplateDocument.safeParse({ version: '1.0', metadata: {} }).success).toBe(false);
    expect(TemplateDocument.safeParse('<mjml/>').success).toBe(false);
  });
});

describe('templates', () => {
  it('accepts a template; the summary drops the document', () => {
    expect(Template.safeParse(template).success).toBe(true);
    expect('document' in TemplateSummary.parse(template)).toBe(false);
    expect(Template.safeParse({ ...template, version: 0 }).success).toBe(false);
  });

  it('create needs a name and a document', () => {
    expect(TemplateCreate.safeParse({ name: 'Base', document: doc }).success).toBe(true);
    expect(TemplateCreate.safeParse({ name: 'Base' }).success).toBe(false);
    expect(TemplateCreate.safeParse({ name: '', document: doc }).success).toBe(false);
  });

  it('update needs base_version plus at least one change', () => {
    expect(TemplateUpdate.safeParse({ base_version: 3, name: 'New' }).success).toBe(true);
    expect(TemplateUpdate.safeParse({ base_version: 3, archived: true }).success).toBe(true);
    expect(TemplateUpdate.safeParse({ base_version: 3 }).success).toBe(false);
    expect(TemplateUpdate.safeParse({ name: 'New' }).success).toBe(false);
  });

  it('version params coerce the path segment', () => {
    expect(TemplateVersionParams.parse({ id: 'tpl_1', version: '4' })).toEqual({ id: 'tpl_1', version: 4 });
    expect(TemplateVersionParams.safeParse({ id: 'tpl_1', version: 'latest' }).success).toBe(false);
  });
});

describe('compile', () => {
  it('always carries mjml, html, warnings and errors', () => {
    const ok = { mjml: '<mjml/>', html: '<html/>', warnings: [], errors: [] };
    expect(CompileResult.safeParse(ok).success).toBe(true);
    expect(
      CompileResult.safeParse({ ...ok, errors: [{ message: 'Unknown block', path: 'sections.0', line: 3 }] }).success,
    ).toBe(true);
    expect(CompileResult.safeParse({ mjml: '', html: '' }).success).toBe(false);
    expect(CompileResult.safeParse({ ...ok, errors: ['plain string'] }).success).toBe(false);
  });

  it('inline compile needs a document', () => {
    expect(CompileRequest.safeParse({ document: doc }).success).toBe(true);
    expect(CompileRequest.safeParse({}).success).toBe(false);
  });
});

describe('assets', () => {
  const asset = {
    id: 'ast_1',
    url: 'https://mail.lumitra.co/a/ast_1',
    content_type: 'image/png',
    size_bytes: 2048,
    width: 600,
    height: 400,
    filename: 'hero.png',
    created_at: TS,
  };

  it('accepts an image asset with a stable url', () => {
    expect(Asset.safeParse(asset).success).toBe(true);
  });

  it('rejects other media types, oversize files and a relative url', () => {
    expect(Asset.safeParse({ ...asset, content_type: 'image/svg+xml' }).success).toBe(false);
    expect(Asset.safeParse({ ...asset, size_bytes: MAX_ASSET_BYTES + 1 }).success).toBe(false);
    expect(Asset.safeParse({ ...asset, url: '/a/ast_1' }).success).toBe(false);
  });
});

describe('asset import', () => {
  it('takes an https address and an optional file name; http only for localhost, as for webhooks', () => {
    expect(AssetImport.safeParse({ url: 'https://cdn.example.com/hero.png', filename: 'hero.png' }).success).toBe(true);
    expect(AssetImport.safeParse({ url: 'http://cdn.example.com/hero.png' }).success).toBe(false);
    expect(AssetImport.safeParse({ url: 'http://127.0.0.1:8080/hero.png' }).success).toBe(true);
    expect(AssetImport.safeParse({ url: 'http://localhost/hero.png' }).success).toBe(true);
  });

  it('refuses other schemes, relative and overlong addresses', () => {
    for (const url of ['ftp://cdn.example.com/a.png', 'file:///etc/passwd', 'data:image/png;base64,AAAA', '/a.png', 'javascript:alert(1)']) {
      expect(AssetImport.safeParse({ url }).success, url).toBe(false);
    }
    expect(AssetImport.safeParse({ url: `https://x.example/${'a'.repeat(MAX_IMPORT_URL_LENGTH)}` }).success).toBe(false);
    expect(AssetImport.safeParse({}).success).toBe(false);
  });
});

describe('template document id', () => {
  it('is optional: a document with or without an id passes the envelope', () => {
    expect(TemplateDocument.safeParse(doc).success).toBe(true);
    expect(TemplateDocument.safeParse({ ...doc, id: 'tpl_doc_1' }).success).toBe(true);
    const { id: _id, ...withoutId } = doc as typeof doc & { id?: string };
    expect(TemplateDocument.safeParse(withoutId).success).toBe(true);
  });
});
