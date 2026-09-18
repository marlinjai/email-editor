import { MAX_IMPORT_ROWS } from '@marlinjai/mail-contract';

/**
 * The CSV reader of the import: RFC 4180 (Request for Comments 4180) quoting,
 * UTF-8 with or without a byte order mark, comma or semicolon (detected from
 * the header line), CRLF or LF line ends, line breaks inside quoted cells.
 * Blank lines are skipped. It never guesses around a broken file: anything it
 * cannot read unambiguously is a `CsvError` with a message for a person.
 */

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

export type ParsedCsv = {
  delimiter: ',' | ';';
  columns: string[];
  /** The data rows, each with its 1-based number after the header (blank lines are not counted). */
  rows: { rowNumber: number; cells: string[] }[];
};

/** Longer than any honest header; also bounds the work before the first row. */
const MAX_COLUMNS = 500;

export function decodeUtf8(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CsvError('The file is not UTF-8 text. Save it as "CSV UTF-8" and upload it again.');
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Comma or semicolon, whichever the header line uses outside quotes (a tie is a comma). */
export function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

/** Splits the text into records of cells. Exported for the unit tests. */
export function* records(text: string, delimiter: string): Generator<{ line: number; cells: string[] }> {
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;
  let i = 0;
  const endCell = () => {
    cells.push(cell);
    cell = '';
    afterQuote = false;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        afterQuote = true;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (cell.length > 0 || afterQuote) {
        throw new CsvError(`Line ${line}: a quote in the middle of an unquoted cell. Quote the whole cell and double the inner quotes ("").`);
      }
      quoted = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endCell();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endCell();
      yield { line: recordLine, cells };
      cells = [];
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line++;
      recordLine = line;
      continue;
    }
    if (afterQuote) {
      throw new CsvError(`Line ${line}: text after a closing quote. Quote the whole cell and double the inner quotes ("").`);
    }
    cell += ch;
    i++;
  }
  if (quoted) throw new CsvError(`Line ${recordLine}: a quoted cell is never closed.`);
  if (cell.length > 0 || cells.length > 0 || afterQuote) {
    endCell();
    yield { line: recordLine, cells };
  }
}

const isBlank = (cells: string[]) => cells.every((c) => c.trim() === '');

export function parseCsv(bytes: Uint8Array, maxRows: number = MAX_IMPORT_ROWS): ParsedCsv {
  const text = decodeUtf8(bytes);
  if (text.trim() === '') throw new CsvError('The file is empty.');
  const delimiter = detectDelimiter(text);
  let columns: string[] | null = null;
  const rows: ParsedCsv['rows'] = [];
  for (const record of records(text, delimiter)) {
    if (isBlank(record.cells)) continue;
    if (columns === null) {
      columns = record.cells.map((c) => c.trim());
      if (columns.length > MAX_COLUMNS) throw new CsvError(`The file has ${columns.length} columns; at most ${MAX_COLUMNS} are read.`);
      const empty = columns.findIndex((c) => c === '');
      if (empty >= 0) throw new CsvError(`The header row has no name for column ${empty + 1}. The first line must name every column.`);
      const seen = new Set<string>();
      for (const c of columns) {
        if (seen.has(c)) throw new CsvError(`The header row names "${c}" twice. Every column needs its own name.`);
        seen.add(c);
      }
      continue;
    }
    if (rows.length >= maxRows) throw new CsvError(`The file has more than ${maxRows} rows. Split it and import the parts one after another.`);
    rows.push({ rowNumber: rows.length + 1, cells: record.cells });
  }
  if (columns === null) throw new CsvError('The file has no header row.');
  if (rows.length === 0) throw new CsvError('The file has a header row but no data rows.');
  return { delimiter, columns, rows };
}

const norm = (header: string) =>
  header
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

const KNOWN: Record<string, 'email' | 'external_id' | 'first_name' | 'last_name' | 'locale'> = {
  email: 'email',
  emailaddress: 'email',
  mail: 'email',
  emailadresse: 'email',
  mailadresse: 'email',
  externalid: 'external_id',
  customerid: 'external_id',
  kundennummer: 'external_id',
  firstname: 'first_name',
  givenname: 'first_name',
  forename: 'first_name',
  vorname: 'first_name',
  lastname: 'last_name',
  surname: 'last_name',
  familyname: 'last_name',
  nachname: 'last_name',
  familienname: 'last_name',
  locale: 'locale',
  language: 'locale',
  lang: 'locale',
  sprache: 'locale',
};

/**
 * A mapping guessed from the header names, in English and German, for the
 * mapping screen to start from: known contact fields by name (the first match
 * wins, later ones are ignored), every other column as a property named after
 * the header, or `ignore` when no valid property key can be made of it.
 */
export function suggestMapping(columns: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const column of columns) {
    const known = KNOWN[norm(column)];
    if (known) {
      out[column] = taken.has(known) ? 'ignore' : known;
      taken.add(known);
      continue;
    }
    const key = column
      .trim()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_.-]/g, '')
      .slice(0, 64);
    const target = key ? `property:${key}` : 'ignore';
    out[column] = key && !taken.has(target) ? target : 'ignore';
    taken.add(target);
  }
  return out;
}
