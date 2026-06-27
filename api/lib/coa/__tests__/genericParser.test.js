import { describe, it, expect } from 'vitest';
import { parseGenericText, parseGenericCSV } from '../genericParser.js';

const SAMPLE_TEXT = `
Batch No: GN-2024-099
Strain: OG Kush
THC: 18.5%
CBD: 0.3%
Cultivation: Indoor
Myrcene: 0.55%
Limonene: 0.38%
β-Caryophyllene: 0.22%
`;

describe('parseGenericText', () => {
  it('extracts batch number', () => {
    const { batches } = parseGenericText(SAMPLE_TEXT, 'TestCo');
    expect(batches[0].batchNo).toBe('GN-2024-099');
  });

  it('extracts THC and CBD', () => {
    const { batches } = parseGenericText(SAMPLE_TEXT, 'TestCo');
    expect(batches[0].thcPct).toBeCloseTo(18.5, 1);
    expect(batches[0].cbdPct).toBeCloseTo(0.3, 1);
  });

  it('extracts terpenes and normalises aliases', () => {
    const { batches } = parseGenericText(SAMPLE_TEXT, 'TestCo');
    expect(batches[0].terpenes.myrcene).toBeCloseTo(0.55, 2);
    expect(batches[0].terpenes.limonene).toBeCloseTo(0.38, 2);
    expect(batches[0].terpenes.caryophyllene).toBeCloseTo(0.22, 2);
  });

  it('provenance = measured when THC + terpenes present', () => {
    const { batches } = parseGenericText(SAMPLE_TEXT, 'TestCo');
    expect(batches[0].provenance).toBe('measured');
  });

  it('returns warning + empty batches when no batch number found', () => {
    const { batches, warnings } = parseGenericText('THC: 18%  Myrcene: 0.3%');
    expect(batches).toHaveLength(0);
    expect(warnings[0]).toMatch(/batch number/i);
  });

  it('strips HTML tags before parsing', () => {
    const html = `<p><b>Batch No:</b> HTML-001</p><p>THC: 20%</p>`;
    const { batches } = parseGenericText(html, 'HTMLCo');
    expect(batches[0].batchNo).toBe('HTML-001');
    expect(batches[0].thcPct).toBeCloseTo(20, 0);
  });
});

describe('parseGenericCSV', () => {
  const csv = [
    'batch_no,strain,thc_pct,cbd_pct,myrcene,limonene',
    'CSV-001,Peace Classic,19.2,0.4,0.6,0.3',
    'CSV-002,Gorilla Glue,22.1,0.1,0.8,0.1',
    '',
  ].join('\n');

  it('parses 2 batches from CSV', () => {
    const { batches } = parseGenericCSV(csv, 'Peace Naturals');
    expect(batches).toHaveLength(2);
  });

  it('first batch has correct values', () => {
    const { batches } = parseGenericCSV(csv, 'Peace Naturals');
    expect(batches[0].batchNo).toBe('CSV-001');
    expect(batches[0].thcPct).toBeCloseTo(19.2, 1);
    expect(batches[0].terpenes.myrcene).toBeCloseTo(0.6, 1);
  });

  it('returns warning for CSV with 1 row', () => {
    const { batches, warnings } = parseGenericCSV('batch_no,thc_pct\n', 'X');
    expect(batches).toHaveLength(0);
    expect(warnings[0]).toMatch(/fewer than 2/i);
  });
});
