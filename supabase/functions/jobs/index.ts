// Run pending server jobs (eBay publish, delist, relist, price changes).
// Called by the app right after queueing work, and by cron every 10 minutes.

import type { Job } from '../_shared/core/types.ts';
import { json, serve } from '../_shared/http.ts';
import { runServerJob, type JobOutcome } from '../_shared/server-jobs.ts';
import { adminClient, isServiceCall, requireUser } from '../_shared/supabase.ts';

serve(async req => {
  const admin = adminClient();
  let jobs: Job[];
  if (isServiceCall(req)) {
    const { data, error } = await admin.rpc('claim_jobs', { p_runner: 'server', p_marketplaces: null, p_limit: 25 });
    if (error) throw error;
    jobs = (data ?? []) as Job[];
  } else {
    // A signed-in seller can only run their own jobs.
    const { db } = await requireUser(req);
    const { data, error } = await db.rpc('claim_jobs', { p_runner: 'server', p_marketplaces: null, p_limit: 10 });
    if (error) throw error;
    jobs = (data ?? []) as Job[];
  }

  const outcomes: JobOutcome[] = [];
  for (const job of jobs) {
    outcomes.push(await runServerJob(admin, job));
  }
  return json(req, { ran: outcomes.length, outcomes });
});
