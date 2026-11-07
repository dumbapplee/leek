import { describe, expect, it } from 'vitest';
import { splitCsvLine } from '../src/imports/csvLine.js';

describe('splitCsvLine', () => {
  it('splits plain fields, including empty ones', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c']);
    expect(splitCsvLine('a,')).toEqual(['a', '']);
  });

  it('keeps commas inside quoted fields and unescapes doubled quotes', () => {
    expect(splitCsvLine('"a,b",c')).toEqual(['a,b', 'c']);
    expect(splitCsvLine('"say ""hi""",x')).toEqual(['say "hi"', 'x']);
    expect(splitCsvLine('""')).toEqual(['']);
  });

  it('rejects an unbalanced or misplaced quote instead of guessing columns', () => {
    expect(splitCsvLine('"abc')).toBeUndefined();
    expect(splitCsvLine('ab"c')).toBeUndefined();
    expect(splitCsvLine('"ab"c,d')).toBeUndefined();
  });
});
