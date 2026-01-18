/**
 * Debug flag - set to true to enable debug logging
 * In production, this should be false
 */
export const DEBUG = false;

const PREFIX = "[Threads Logger]";

/**
 * Debug logger - only logs when DEBUG is true
 */
export const debug = {
  log: (...args: unknown[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(PREFIX, ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (DEBUG) {
      console.warn(PREFIX, ...args);
    }
  },
  error: (...args: unknown[]) => {
    // Errors are always logged regardless of DEBUG flag
    console.error(PREFIX, ...args);
  },
};
