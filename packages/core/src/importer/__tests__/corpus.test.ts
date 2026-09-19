import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import mjml2html from 'mjml';
import { describe, expect, it } from 'vitest';
import { allPrebuiltTemplates } from '../../../../blocks/src/prebuilt';
import { MJMLCompiler } from '../../compiler/MJMLCompiler';
import { validateTemplate } from '../../schema/validation';
import type { EmailTemplate } from '../../schema/types';
import { importMjml } from '../importMjml';
import { signature } from './signature';

const compiler = new MJMLCompiler();
const compile = (doc: EmailTemplate) => compiler.compile(doc);

/*
 * The round-trip corpus.
 *
 * 1. The editor's 35 prebuilt sections: document -> MJML -> import -> MJML.
 *    The editor recognises its own export, so the imported document compiles
 *    to exactly the same MJML and HTML, with no warning of severity "warning",
 *    and a second round trip changes nothing.
 * 2. Hand-written MJML in the shapes real mails take (corpus/*.mjml): the
 *    source compiled by MJML directly is the reference, and the imported
 *    document must compile to structurally equivalent HTML (same text, links,
 *    images and background colours). Re-exporting and importing again is
 *    stable.
 */

describe('round trip: the 35 prebuilt sections', () => {
  it('has all 35', () => {
    expect(allPrebuiltTemplates).toHaveLength(35);
  });

  for (const template of allPrebuiltTemplates) {
    it(`${template.id}: export, import, export gives the same MJML and HTML`, () => {
      const doc: EmailTemplate = {
        version: '1.0',
        metadata: { title: template.name, previewText: template.description ?? '' },
        sections: [structuredClone(template.section)],
      };
      const first = compile(doc);

      const imported = importMjml(first.mjml);
      expect(imported.warnings.filter((w) => w.severity === 'warning')).toEqual([]);
      expect(validateTemplate(imported.document).success).toBe(true);

      const second = compile(imported.document);
      expect(second.errors).toEqual(first.errors);
      expect(second.mjml).toBe(first.mjml);
      expect(second.html).toBe(first.html);

      // Ids survive, so the editor's selection and history stay attached.
      expect(imported.document.sections[0]!.id).toBe(template.section.id);
      const again = importMjml(second.mjml);
      expect(again.document).toEqual(imported.document);
    });
  }
});

const corpusDir = join(__dirname, 'corpus');
const samples = readdirSync(corpusDir).filter((f) => f.endsWith('.mjml'));

describe('round trip: real-world MJML', () => {
  it('has samples', () => {
    expect(samples.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of samples) {
    it(`${file}: the imported document compiles to equivalent HTML, and a second pass is stable`, () => {
      const source = readFileSync(join(corpusDir, file), 'utf8');
      const reference = mjml2html(source, { validationLevel: 'soft', minify: false }).html;

      const { document, warnings } = importMjml(source);
      expect(validateTemplate(document).success).toBe(true);
      const compiled = compile(document);
      expect(signature(compiled.html)).toEqual(signature(reference));

      // Export the imported document and import it again: the same document.
      const again = importMjml(compiled.mjml);
      expect(compile(again.document).mjml).toBe(compiled.mjml);
      // Warnings carry a path and a message, and fallbacks their source.
      for (const w of warnings) {
        expect(w.path).not.toBe('');
        expect(w.message).not.toBe('');
        if (w.code === 'kept_as_html' || w.code === 'unknown_component') expect(w.fragment).toBeTruthy();
      }
    });
  }
});
