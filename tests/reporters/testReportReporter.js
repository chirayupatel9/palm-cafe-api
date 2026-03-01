/**
 * Jest custom reporter: writes tests/report/test-report.json and prints a summary.
 */
const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.resolve(__dirname, '../report');
const REPORT_FILE = path.join(REPORT_DIR, 'test-report.json');

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

function readCoverageSummary() {
  const summaryPath = path.resolve(__dirname, '../../coverage/coverage-summary.json');
  try {
    if (fs.existsSync(summaryPath)) {
      const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
          const total = data.total || {};
      return {
        lines: total.lines && total.lines.pct != null ? total.lines.pct : null,
        functions: total.functions && total.functions.pct != null ? total.functions.pct : null,
        branches: total.branches && total.branches.pct != null ? total.branches.pct : null,
        statements: total.statements && total.statements.pct != null ? total.statements.pct : null
      };
    }
  } catch (e) {
    // ignore
  }
  return { lines: null, functions: null, branches: null, statements: null };
}

class TestReportReporter {
  constructor(_globalConfig, _options) {
    this._globalConfig = _globalConfig;
  }

  onRunComplete(_contexts, aggregatedResult) {
    const totalTests = aggregatedResult.numTotalTests || 0;
    const passed = aggregatedResult.numPassedTests || 0;
    const failed = aggregatedResult.numFailedTests || 0;
    const durationMs = aggregatedResult.startTime
      ? (Date.now() - aggregatedResult.startTime)
      : 0;

    const coverage = readCoverageSummary();
    const report = {
      totalTests,
      passed,
      failed,
      coverage,
      durationMs,
      timestamp: new Date().toISOString()
    };

    ensureReportDir();
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

    console.log('\n========== Test Execution Report ==========');
    console.log(`Total:  ${totalTests}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (coverage.lines != null) {
      console.log(`Coverage - Lines: ${coverage.lines}%, Functions: ${coverage.functions}%, Branches: ${coverage.branches}%, Statements: ${coverage.statements}%`);
    }
    console.log(`Duration: ${durationMs}ms`);
    console.log(`Report: ${REPORT_FILE}`);
    console.log('============================================\n');
  }
}

module.exports = TestReportReporter;
