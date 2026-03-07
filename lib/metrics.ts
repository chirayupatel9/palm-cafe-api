/**
 * In-memory request/error counters for /api/metrics.
 */
let requestCount = 0;
let errorCount = 0;

export function incrementRequestCount(): void {
  requestCount += 1;
}

export function incrementErrorCount(): void {
  errorCount += 1;
}

export function getCounts(): { requestCount: number; errorCount: number } {
  return { requestCount, errorCount };
}

export function resetCounts(): void {
  requestCount = 0;
  errorCount = 0;
}
