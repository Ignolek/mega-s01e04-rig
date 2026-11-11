export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job's events, ordered chronologically by their parsed timestamps. */
export type DigestRow = {
  job: string;
  /** Owner from the latest event, including null when no owner was recorded. */
  owner: string | null;
  /** Total valid events for this job, including retry and fail events. */
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Latest error-bearing event's error, retained after a subsequent success. */
  lastError: string | null;
  /** Original timestamp strings, preserving each log entry's UTC offset. */
  firstTime: string;
  lastTime: string;
  /** True if any event failed, even if a later event succeeded. */
  hasFail: boolean;
};

export type DigestNight = {
  /** One row per job, sorted by job name using a stable lexical comparison. */
  rows: DigestRow[];
  /** Invalid non-empty lines, including malformed event records. */
  badLines: number;
  /** Counts of valid events, rather than counts of each job's final status. */
  counts: Record<RunStatus, number>;
};

/**
 * Public readNight(runsDir, night) contract; implemented by reader.ts.
 * A missing night returns null. An empty file returns an empty DigestNight.
 * Malformed lines are counted without preventing the remaining file from rendering.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
