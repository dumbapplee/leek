// Splits one CSV line (RFC 4180, no embedded newlines). Returns undefined on an unbalanced
// or misplaced quote so the caller rejects the line instead of guessing its columns.
export function splitCsvLine(line: string): string[] | undefined {
  const fields: string[] = [];
  let field = '';
  let state: 'start' | 'unquoted' | 'quoted' | 'closedQuote' = 'start';
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (state === 'quoted') {
      if (char !== '"') {
        field += char;
      } else if (line.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else {
        state = 'closedQuote';
      }
      continue;
    }
    if (char === ',') {
      fields.push(field);
      field = '';
      state = 'start';
      continue;
    }
    if (state === 'closedQuote') {
      return undefined;
    }
    if (char === '"') {
      if (state !== 'start') {
        return undefined;
      }
      state = 'quoted';
      continue;
    }
    field += char;
    state = 'unquoted';
  }
  if (state === 'quoted') {
    return undefined;
  }
  fields.push(field);
  return fields;
}
