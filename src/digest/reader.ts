import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(record.at) ||
    !Number.isFinite(Date.parse(record.at)) ||
    typeof record.job !== 'string' || record.job.trim().length === 0 ||
    (record.status !== 'ok' && record.status !== 'retry' && record.status !== 'fail') ||
    (record.owner !== null && typeof record.owner !== 'string') ||
    (record.error !== undefined && typeof record.error !== 'string')
  ) return null;
  return {
    at: record.at,
    job: record.job,
    status: record.status,
    owner: record.owner,
    ...(record.error === undefined ? {} : { error: record.error }),
  };
}

function summarize(events: RunEvent[], digest: DigestNight): void {
  // Stable sort keeps file order when two events have the same instant.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const jobs = new Map<string, DigestRow>();
  for (const event of events) {
    digest.counts[event.status] += 1;
    let row = jobs.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0,
        lastStatus: event.status, lastError: null,
        firstTime: event.at, lastTime: event.at, hasFail: false,
      };
      jobs.set(event.job, row);
    }
    row.runs += 1;
    row.retries += event.status === 'retry' ? 1 : 0;
    row.lastStatus = event.status;
    row.owner = event.owner;
    row.lastTime = event.at;
    row.hasFail ||= event.status === 'fail';
    if (event.error !== undefined) row.lastError = event.error;
  }
  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
}

export const readNight: ReadNight = (runsDir, night) => {
  // A date-only filename cannot escape runsDir, on Windows or POSIX.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  const date = new Date(`${night}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== night) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const digest: DigestNight = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const events: RunEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (event) events.push(event);
    else digest.badLines += 1;
  }
  summarize(events, digest);
  return digest;
};
