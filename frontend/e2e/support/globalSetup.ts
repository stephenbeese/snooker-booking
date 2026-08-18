import { fetchOpeningHours, OPENING_HOURS_ENV } from './helpers';

/**
 * Reads the club's trading week once, before any spec runs, and passes it to the workers.
 *
 * <p>`openDay()` needs to know which days the club is actually open, and it is called
 * synchronously from 17 places across five specs. Fetching once here keeps it synchronous
 * rather than rewriting every call site to await a value that does not change during a run.
 *
 * <p>Handed over in an environment variable rather than a module-level cache: global setup runs
 * in its own process, so anything it merely assigns to a module is invisible to the workers
 * that import that same module afresh. `process.env` is the one channel that crosses.
 */
export default async function globalSetup(): Promise<void> {
  process.env[OPENING_HOURS_ENV] = JSON.stringify(await fetchOpeningHours());
}
