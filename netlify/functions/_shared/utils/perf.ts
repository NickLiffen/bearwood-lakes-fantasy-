// Performance instrumentation utilities for debugging slow endpoints

interface TimingLog {
  operation: string;
  durationMs: number;
  meta?: Record<string, unknown>;
}

/**
 * Performance timer for measuring operation durations.
 * Usage:
 *   const timer = createPerfTimer('my-team');
 *   const data = await timer.measure('settings-query', async () => db.find(...));
 *   timer.end(); // logs summary
 */
export function createPerfTimer(handlerName: string) {
  const start = Date.now();
  const logs: TimingLog[] = [];
  
  return {
    /**
     * Measure an async operation's duration
     */
    async measure<T>(operation: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
      const opStart = Date.now();
      const result = await fn();
      const durationMs = Date.now() - opStart;
      logs.push({ operation, durationMs, meta });
      return result;
    },
    
    /**
     * Log a manual timing entry
     */
    log(operation: string, durationMs: number, meta?: Record<string, unknown>) {
      logs.push({ operation, durationMs, meta });
    },
    
    /**
     * End timing and log summary
     */
    end(payloadSize?: number) {
      const totalMs = Date.now() - start;
      const summary = {
        handler: handlerName,
        totalMs,
        payloadBytes: payloadSize,
        operations: logs,
      };
      
      // Only log in development or when PERF_LOG is set
      if (process.env.PERF_LOG === 'true' || process.env.NODE_ENV === 'development') {
        console.log(`[PERF] ${handlerName}:`, JSON.stringify(summary));
      }
      
      return summary;
    },
    
    /**
     * Get elapsed time so far
     */
    elapsed(): number {
      return Date.now() - start;
    },
  };
}

/**
 * Simple timer for one-off measurements
 */
export function measureTime<T>(label: string, fn: () => T): T {
  const start = Date.now();
  const result = fn();
  console.log(`[PERF] ${label}: ${Date.now() - start}ms`);
  return result;
}

/**
 * Async version of measureTime
 */
export async function measureTimeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  console.log(`[PERF] ${label}: ${Date.now() - start}ms`);
  return result;
}
