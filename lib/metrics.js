/**
 * In-memory request/error counters for /api/metrics. Not persisted.
 */
let requestCount = 0;
let errorCount = 0;

/**
 * Increment the in-memory API request counter by one.
 *
 * Updates the process-local request total used for monitoring request volume since the process started.
 */
function incrementRequestCount() {
  requestCount += 1;
}

/**
 * Increment the internal in-memory error counter by one.
 *
 * This updates the module-scoped `errorCount` value used to track API error occurrences.
 */
function incrementErrorCount() {
  errorCount += 1;
}

/**
 * Retrieve the current in-memory API metrics counters.
 *
 * @returns {{requestCount: number, errorCount: number}} Current values of the request and error counters.
 */
function getCounts() {
  return { requestCount, errorCount };
}

/**
 * Reset both in-memory API metric counters to zero.
 *
 * This sets `requestCount` and `errorCount` back to 0.
 */
function resetCounts() {
  requestCount = 0;
  errorCount = 0;
}

module.exports = {
  incrementRequestCount,
  incrementErrorCount,
  getCounts,
  resetCounts
};
