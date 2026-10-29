// What every full sell-form driver gets from the content script.

import type { FillResult, ListingWork } from '../shared/messages.ts';

export class Stopped extends Error {
  constructor() {
    super('Stopped');
  }
}

export interface DriverContext {
  /** Tell the seller (and the background worker) what is happening. */
  step(message: string): void;
  /** Throws Stopped once the seller pressed Stop. */
  check(): void;
  /** Last chance to stop before the site's own post button: false means don't post. */
  beforePost(): Promise<boolean>;
}

export type Driver = (work: ListingWork, files: File[], ctx: DriverContext) => Promise<FillResult>;

/** Collects what was filled and what was not, as a driver goes. */
export class Tally {
  filled: string[] = [];
  missing: string[] = [];
  photos = 0;
  /** The site's server failed, not the form. */
  retry = false;
  ok(name: string, done: boolean | number | string | string[] | null | undefined) {
    const yes = Array.isArray(done) ? done.length > 0 : Boolean(done);
    (yes ? this.filled : this.missing).push(name);
    return yes;
  }
  result(posted: boolean, error?: string): FillResult {
    return { ok: !error, filled: this.filled, missing: this.missing, photos: this.photos, posted, ...(error ? { error } : {}), ...(this.retry ? { retry: true } : {}) };
  }
}
