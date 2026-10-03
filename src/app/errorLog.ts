// A small local log of recent JavaScript errors, so a problem report can include them.
// Kept on the phone only (meta 'errorLog'), never sent anywhere. It holds the error message, the
// code file and line, and the time – no names, no moves, no profile data. The last 20 errors.
import { dbGet, dbPut } from '../storage/db';

export interface ErrorEntry {
  /** Time (ms). */
  at: number;
  message: string;
  /** "main-abc123.js:1:2345" – the code file only, without the site address. */
  where?: string;
  /** How many times in a row the same error happened. */
  count: number;
}

const KEY = 'errorLog';
const MAX = 20;
const MAX_TEXT = 200;

/** Keep only the file name of a code address (no host, no query). */
function shortSource(src: string | undefined, line?: number, col?: number): string | undefined {
  if (!src) return undefined;
  const file = src.split(/[?#]/)[0].split('/').pop() || src;
  return [file, line, col].filter((x) => x !== undefined && x !== 0 && x !== '').join(':');
}

let queue: Promise<void> = Promise.resolve();
let writing = false;

/** Add an error to the log (never throws). */
export function logError(error: unknown, where?: string): void {
  if (writing) return; // an error while saving an error: do not loop
  let message: string;
  if (error instanceof Error) message = `${error.name}: ${error.message}`;
  else if (typeof error === 'string') message = error;
  else {
    try {
      message = JSON.stringify(error) ?? String(error);
    } catch {
      message = String(error);
    }
  }
  message = message.replace(/https?:\/\/[^\s)]+\//g, '').slice(0, MAX_TEXT);
  if (!where && error instanceof Error && error.stack) {
    // The first code location in the stack.
    const m = /(\S+\.js):(\d+):(\d+)/.exec(error.stack);
    if (m) where = shortSource(m[1], Number(m[2]), Number(m[3]));
  }
  const at = Date.now();
  queue = queue.then(async () => {
    writing = true;
    try {
      const log = (await dbGet<ErrorEntry[]>('meta', KEY)) ?? [];
      const last = log[log.length - 1];
      if (last && last.message === message && last.where === where) {
        last.count += 1;
        last.at = at;
      } else log.push({ at, message, where, count: 1 });
      await dbPut('meta', KEY, log.slice(-MAX));
    } catch {
      // Storage is not available: nothing to do.
    } finally {
      writing = false;
    }
  });
}

export async function readErrorLog(): Promise<ErrorEntry[]> {
  await queue;
  return (await dbGet<ErrorEntry[]>('meta', KEY)) ?? [];
}

export function clearErrorLog(): Promise<void> {
  return dbPut('meta', KEY, []);
}

/** Catch errors nobody handled. Called once, at start. */
export function installErrorLog(): void {
  window.addEventListener('error', (e) => {
    // A resource that failed to load (an image, a script tag) has no message: skip it.
    if (!e.message) return;
    logError(e.error instanceof Error ? e.error : e.message, shortSource(e.filename, e.lineno, e.colno));
  });
  window.addEventListener('unhandledrejection', (e) => logError(e.reason ?? 'unhandled rejection'));
}
