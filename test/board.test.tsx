import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readStatus } from '../src/status.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};

describe('night links on the status board', () => {
  it('counts log events rather than job final statuses and ignores the malformed line', () => {
    const status = readStatus(config);
    expect(status.nights).toEqual(['2026-10-28', '2026-10-27']);
    expect(status.nightCounts).toEqual({
      '2026-10-28': { ok: 10, retry: 4, fail: 1 },
      '2026-10-27': { ok: 7, retry: 0, fail: 0 },
    });
  });

  it('links both fixture nights with their event counts beside them, newest first', async () => {
    const response = await createApp(config).request('/');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toMatch(/href="\/digest\/2026-10-28">2026-10-28<\/a>\s*·\s*10 ok \/ 4 retry \/ 1 fail/);
    expect(html).toMatch(/href="\/digest\/2026-10-27">2026-10-27<\/a>\s*·\s*7 ok \/ 0 retry \/ 0 fail/);
    expect(html.indexOf('/digest/2026-10-28')).toBeLessThan(html.indexOf('/digest/2026-10-27'));
  });
});
