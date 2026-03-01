/**
 * GlobalTeardown: optional cleanup after all tests.
 * Does NOT drop the test database or tables - keeps test DB for next run.
 * Use for closing connections or logging if needed.
 */
module.exports = async () => {
  // No destructive cleanup; test DB remains for idempotent re-runs
};
