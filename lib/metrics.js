/**
 * In-memory request/error counters for /api/metrics. Not persisted.
 */
let requestCount = 0;
let errorCount = 0;

function incrementRequestCount() {
  requestCount += 1;
}

function incrementErrorCount() {
  errorCount += 1;
}

function getCounts() {
  return { requestCount, errorCount };
}

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
