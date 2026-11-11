import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
function nightFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  dirs.push(dir);
  writeFileSync(join(dir, '2026-10-28.jsonl'), contents);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('summarizes the real fixture without dropping unknown owners or bad lines', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(night?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(night?.rows[0].owner).toBeNull();
    expect(night?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(night?.rows[3]).toMatchObject({ hasFail: true, lastError: 'quota exceeded' });
  });

  it('distinguishes missing nights from empty files', () => {
    const dir = nightFile(' \r\n\n');
    expect(readNight(dir, '2026-10-27')).toBeNull();
    expect(readNight(dir, '2026-10-28')).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts invalid JSON and invalid schemas while retaining valid events', () => {
    const valid = { at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: null };
    const dir = nightFile([
      '{', 'null', '[]', '{}', JSON.stringify({ ...valid, status: 'unknown' }),
      JSON.stringify({ ...valid, owner: 9 }), JSON.stringify({ ...valid, error: {} }),
      JSON.stringify({ ...valid, at: 'not a date' }), JSON.stringify({ ...valid, job: ' ' }),
      JSON.stringify(valid),
    ].join('\n'));
    expect(readNight(dir, '2026-10-28')).toMatchObject({ badLines: 9, rows: [{ job: 'a', owner: null, runs: 1 }] });
  });

  it('sorts by actual time, keeps offsets and remembers an earlier failure after success', () => {
    const dir = nightFile([
      { at: '2026-10-29T00:30:00+02:00', status: 'ok', owner: null },
      { at: '2026-10-28T23:00:00+01:00', status: 'retry', owner: 'b', error: 'second' },
      { at: '2026-10-28T21:00:00Z', status: 'fail', owner: 'a', error: 'first' },
    ].map(event => JSON.stringify({ ...event, job: 'one' })).join('\n'));
    expect(readNight(dir, '2026-10-28')?.rows).toEqual([{
      job: 'one', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'second',
      firstTime: '2026-10-28T21:00:00Z', lastTime: '2026-10-29T00:30:00+02:00', hasFail: true,
    }]);
  });

  it('rejects path traversal and impossible calendar dates', () => {
    const dir = nightFile('');
    for (const night of ['../2026-10-28', '..\\2026-10-28', '2026-10-28/extra', '2026-02-30', '2026-13-01']) {
      expect(readNight(dir, night)).toBeNull();
    }
  });
});
