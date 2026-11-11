import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const night = '2026-10-28';
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const tempPrefix = join(tmpdir(), 'rig-digest-routes-');
let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(tempPrefix);
});

afterEach(() => {
  const target = resolve(runsDir);
  if (!target.startsWith(resolve(tempPrefix)) || target === resolve(tmpdir())) {
    throw new Error('Refusing cleanup outside the test temporary directory');
  }
  rmSync(target, { recursive: true, force: true });
});

function writeNight(lines: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
}

function app() {
  return createApp({ ...config, runsDir });
}

function tableCells(html: string): string[][] {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => cell[1].replace(/<[^>]*>/g, '')),
  );
}

describe('digest routes', () => {
  it('returns the same sorted jobs and values in the HTML and JSON', async () => {
    writeNight([
      { at: '2026-10-29T01:00:00+01:00', job: 'zeta', status: 'retry', owner: 'rook', error: 'upstream 503' },
      { at: '2026-10-28T23:00:00+01:00', job: 'alpha', status: 'ok', owner: 'lane-07' },
      { at: '2026-10-29T01:01:00+01:00', job: 'zeta', status: 'ok', owner: 'rook' },
    ]);
    const instance = app();
    const page = await instance.request(`/digest/${night}`);
    const api = await instance.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(api.headers.get('content-type')).toContain('application/json');
    const digest = await api.json() as DigestNight;
    const cells = tableCells(await page.text());
    expect(digest.rows.map((row) => row.job)).toEqual(['alpha', 'zeta']);
    expect(cells).toEqual([
      ['alpha', 'lane-07', '1', '0', 'ok', '—', '2026-10-28T23:00:00+01:00', '2026-10-28T23:00:00+01:00'],
      ['zeta', 'rook', '2', '1', 'ok', 'upstream 503', '2026-10-29T01:00:00+01:00', '2026-10-29T01:01:00+01:00'],
    ]);
    for (const [index, row] of digest.rows.entries()) {
      expect(cells[index]).toEqual([
        row.job, row.owner, String(row.runs), String(row.retries), row.lastStatus,
        row.lastError ?? '—', row.firstTime, row.lastTime,
      ]);
    }
  });

  it('returns 404 for a missing or invalid night on both routes', async () => {
    const instance = app();
    for (const path of ['/digest/', '/api/digest/']) {
      expect((await instance.request(`${path}${night}`)).status).toBe(404);
      expect((await instance.request(`${path}not-a-night`)).status).toBe(404);
      expect((await instance.request(`${path}2026-02-30`)).status).toBe(404);
    }
  });

  it('distinguishes an empty existing night from a missing one', async () => {
    writeNight([]);
    const instance = app();
    const page = await instance.request(`/digest/${night}`);
    const api = await instance.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('keeps valid rows and null owners when another line is malformed', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), JSON.stringify({
      at: '2026-10-29T05:41:09+01:00', job: 'digest/render', status: 'ok', owner: null,
    }) + '\n{"broken":\n');
    const instance = app();
    const page = await instance.request(`/digest/${night}`);
    const api = await instance.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('bad lines: 1');
    expect(tableCells(html)[0].slice(0, 2)).toEqual(['digest/render', '—']);
    const digest = await api.json() as DigestNight;
    expect(digest.badLines).toBe(1);
    expect(digest.rows).toHaveLength(1);
    expect(digest.rows[0].owner).toBeNull();
  });

  it('marks high retries and a past failure even when the latest status is ok', async () => {
    writeNight([
      ...[0, 1, 2].map((minute) => ({ at: `2026-10-29T01:0${minute}:00+01:00`, job: 'recover', status: 'retry', owner: 'rook' })),
      { at: '2026-10-29T01:03:00+01:00', job: 'recover', status: 'fail', owner: 'rook', error: 'failed once' },
      { at: '2026-10-29T01:04:00+01:00', job: 'recover', status: 'ok', owner: 'rook' },
    ]);
    const html = await (await app().request(`/digest/${night}`)).text();
    expect(html).toContain('fail occurred');
    expect(html).toContain('3 · high');
    expect(tableCells(html)[0][4]).toBe('ok');
  });

  it('escapes untrusted job names and errors while preserving their JSON values', async () => {
    const job = '<script>alert(1)</script>';
    const error = '<img src=x onerror=alert(2)>';
    writeNight([{ at: '2026-10-29T05:00:00-03:00', job, status: 'fail', owner: null, error }]);
    const instance = app();
    const html = await (await instance.request(`/digest/${night}`)).text();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('2026-10-29T05:00:00-03:00');
    const digest = await (await instance.request(`/api/digest/${night}`)).json() as DigestNight;
    expect(digest.rows[0]).toMatchObject({ job, lastError: error, lastTime: '2026-10-29T05:00:00-03:00' });
  });
});
