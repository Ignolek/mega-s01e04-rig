import type { DigestNight } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: DigestNight }) {
  const rows = [...digest.rows].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);

  return (
    <>
      <p><a href="/">status board</a></p>
      <h1>morning digest · {night}</h1>
      <p>{digest.counts.ok} ok · {digest.counts.retry} retry · {digest.counts.fail} fail</p>
      <p class={digest.badLines > 0 ? 'warn' : 'mute'}>
        bad lines: {digest.badLines}{digest.badLines > 0 ? ' · skipped; remaining events are shown' : ''}
      </p>
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <div class="digest-scroll" role="region" aria-label="Nightly jobs; scroll horizontally for all columns" tabindex={0}>
          <table class="digest-table">
            <caption>Jobs for {night}, sorted by job name</caption>
            <thead>
              <tr>
                <th scope="col">job</th>
                <th scope="col">owner</th>
                <th scope="col">runs</th>
                <th scope="col">retries</th>
                <th scope="col">last status</th>
                <th scope="col">last error</th>
                <th scope="col">first time</th>
                <th scope="col">last time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr class={row.hasFail ? 'had-fail' : undefined}>
                  <th scope="row">{row.job}{row.hasFail ? <strong class="warn"> · fail occurred</strong> : null}</th>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td class={row.retries >= 3 ? 'warn' : undefined}>
                    {row.retries >= 3 ? <strong>{row.retries} · high</strong> : row.retries}
                  </td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td><time datetime={row.firstTime}>{row.firstTime}</time></td>
                  <td><time datetime={row.lastTime}>{row.lastTime}</time></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
