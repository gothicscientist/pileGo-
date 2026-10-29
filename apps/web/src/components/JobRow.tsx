import type { Job } from '@pilego/core';
import { cx } from '~/lib/format';
import { useCancelJob, useRetryJob } from '~/lib/queries';
import { Sticker } from './bits';
import { Button } from './ui';

export function JobRow({ job, showItem }: { job: Job; showItem?: string }) {
  const retry = useRetryJob();
  const cancel = useCancelJob();
  const verb = { publish: 'Listing', delist: 'Ending', relist: 'Relisting', import: 'Importing', sync: 'Syncing', update_price: 'Updating price' }[job.kind];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <Sticker id={job.marketplace} size="sm" tilt={false} />
      <span className="font-medium">
        {verb}
        {showItem ? ` ${showItem}` : ''}
      </span>
      <span className={cx('text-muted', (job.status === 'failed' || job.status === 'needs_user') && 'font-semibold text-danger')}>
        {job.status === 'pending'
          ? job.runner === 'extension'
            ? 'waiting for the extension'
            : 'waiting'
          : job.status === 'running'
            ? 'running now'
            : job.status === 'needs_user'
              ? 'needs you'
              : 'failed'}
      </span>
      {job.error && <span className="w-full text-ink-2">{job.error}</span>}
      {(job.status === 'failed' || job.status === 'needs_user') && (
        <span className="flex gap-1">
          <Button size="sm" variant="line" busy={retry.isPending} onClick={() => retry.mutate(job)}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => cancel.mutate(job)}>
            Dismiss
          </Button>
        </span>
      )}
      {job.status === 'pending' && (
        <Button size="sm" variant="ghost" onClick={() => cancel.mutate(job)}>
          Cancel
        </Button>
      )}
    </li>
  );
}
