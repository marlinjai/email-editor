import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv, suggestMapping } from '../../src/imports/csv.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('the import CSV reader', () => {
  it('reads commas, CRLF, quotes with doubled quotes and line breaks inside quotes', () => {
    const csv = parseCsv(bytes('Email,Name,Note\r\na@b.de,"Lovelace, Ada","said ""hi""\r\ntwice"\r\nc@d.de,Grace,\r\n'));
    expect(csv.delimiter).toBe(',');
    expect(csv.columns).toEqual(['Email', 'Name', 'Note']);
    expect(csv.rows).toEqual([
      { rowNumber: 1, cells: ['a@b.de', 'Lovelace, Ada', 'said "hi"\r\ntwice'] },
      { rowNumber: 2, cells: ['c@d.de', 'Grace', ''] },
    ]);
  });

  it('detects a semicolon, drops a byte order mark, skips blank lines and reads a last line without a newline', () => {
    const csv = parseCsv(bytes('﻿E-Mail;Vorname\n\na@b.de;Ada\n   \nc@d.de;Grace'));
    expect(csv.delimiter).toBe(';');
    expect(csv.columns).toEqual(['E-Mail', 'Vorname']);
    expect(csv.rows.map((r) => r.cells)).toEqual([
      ['a@b.de', 'Ada'],
      ['c@d.de', 'Grace'],
    ]);
    expect(csv.rows.map((r) => r.rowNumber)).toEqual([1, 2]);
  });

  it('keeps rows with a different cell count for the row check to report', () => {
    const csv = parseCsv(bytes('a,b\n1\n1,2,3\n'));
    expect(csv.rows.map((r) => r.cells.length)).toEqual([1, 3]);
  });

  it('refuses what it cannot read unambiguously', () => {
    const refuse = (input: Uint8Array | string, message: RegExp) =>
      expect(() => parseCsv(typeof input === 'string' ? bytes(input) : input)).toThrowError(message);
    refuse('', /empty/);
    refuse('  \n\n', /empty/);
    refuse(new Uint8Array([0x45, 0x6d, 0xe4, 0x69, 0x6c, 0x0a, 0x61]), /not UTF-8/);
    refuse('Email\n', /no data rows/);
    refuse('Email,Email\na,b\n', /twice/);
    refuse('Email,\na,b\n', /no name for column 2/);
    refuse('Email\n"a@b.de\n', /never closed/);
    refuse('Email\na"b@c.de\n', /quote in the middle/);
    refuse('Email\n"a"b\n', /after a closing quote/);
    expect(() => parseCsv(bytes('Email\na\nb\nc\n'), 2)).toThrowError(CsvError);
    expect(() => parseCsv(bytes('Email\na\nb\nc\n'), 2)).toThrowError(/more than 2 rows/);
  });
});

describe('the suggested mapping', () => {
  it('knows English and German contact fields and makes properties of the rest', () => {
    expect(suggestMapping(['E-Mail', 'Vorname', 'Nachname', 'Sprache', 'Kundennummer', 'Stadt', 'Lieblings Farbe', '???'])).toEqual({
      'E-Mail': 'email',
      Vorname: 'first_name',
      Nachname: 'last_name',
      Sprache: 'locale',
      Kundennummer: 'external_id',
      Stadt: 'property:Stadt',
      'Lieblings Farbe': 'property:Lieblings_Farbe',
      '???': 'ignore',
    });
    expect(suggestMapping(['Email', 'email address', 'First Name'])).toEqual({
      Email: 'email',
      'email address': 'ignore',
      'First Name': 'first_name',
    });
  });
});
