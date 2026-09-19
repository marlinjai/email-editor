// packages/core/src/store/mst/MJMLExporter.ts
/**
 * MJML Exporter - Converts a live MST template to MJML/HTML
 *
 * This exporter is called ONLY when the user clicks Export/Send,
 * NOT during editing. This separation is key to achieving instant
 * visual feedback during editing.
 *
 * It compiles the store's snapshot with `MJMLCompiler`, the one compiler the
 * editor has, so an export from the store and a compile of the saved document
 * give the same mail (wrappers, sub-columns, kept attributes and all).
 *
 * IMPORTANT: This file should only be imported on the server side
 * as it uses the mjml package which is not browser-safe.
 */

import mjml2html from 'mjml';
import { getSnapshot } from 'mobx-state-tree';
import { MJMLCompiler } from '../../compiler/MJMLCompiler';
import type { EmailTemplate } from '../../schema/types';
import type { TemplateInstance } from './models/TemplateModel';

/**
 * Result of MJML export
 */
export interface ExportResult {
  /** Raw MJML markup */
  mjml: string;
  /** Compiled HTML */
  html: string;
  /** Any compilation errors */
  errors?: string[];
}

/**
 * Export options
 */
export interface ExportOptions {
  /** MJML validation level */
  validationLevel?: 'strict' | 'soft' | 'skip';
  /** Minify output HTML */
  minify?: boolean;
  /** Add beautiful comments for debugging */
  beautify?: boolean;
}

/**
 * MJMLExporter - Exports MST template to MJML and HTML
 */
export class MJMLExporter {
  private options: Required<ExportOptions>;
  private compiler = new MJMLCompiler();

  constructor(options: ExportOptions = {}) {
    this.options = {
      validationLevel: options.validationLevel || 'soft',
      minify: options.minify ?? false,
      beautify: options.beautify ?? false,
    };
  }

  /**
   * Export template to MJML + HTML
   */
  export(template: TemplateInstance): ExportResult {
    const mjml = this.exportMJML(template);
    try {
      const result = mjml2html(mjml, {
        // Never resolve <mj-include>: see MJMLCompiler.compile.
        ignoreIncludes: true,
        validationLevel: this.options.validationLevel,
        minify: this.options.minify,
        beautify: this.options.beautify,
      });
      return {
        mjml,
        html: result.html,
        errors: result.errors.length > 0 ? result.errors.map((e) => e.formattedMessage) : undefined,
      };
    } catch (error) {
      // validationLevel "strict" throws on invalid MJML: report it, as the compiler does.
      return { mjml, html: '', errors: [error instanceof Error ? error.message : 'Unknown compilation error'] };
    }
  }

  /**
   * Export only MJML (without HTML compilation)
   */
  exportMJML(template: TemplateInstance): string {
    return this.compiler.toMJML(JSON.parse(JSON.stringify(getSnapshot(template))) as EmailTemplate);
  }
}

/**
 * Create a new MJML exporter with default options
 */
export function createMJMLExporter(options?: ExportOptions): MJMLExporter {
  return new MJMLExporter(options);
}

/**
 * Quick export function for simple use cases
 */
export function exportTemplate(template: TemplateInstance, options?: ExportOptions): ExportResult {
  const exporter = new MJMLExporter(options);
  return exporter.export(template);
}
