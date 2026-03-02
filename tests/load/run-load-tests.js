/**
 * Run k6 load tests and output structured report.
 * Usage: node tests/load/run-load-tests.js [--login|--orders|--mixed|--all]
 * Requires k6 installed: https://k6.io/docs/get-started/installation/
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_URL = process.env.API_URL || 'http://localhost:5000';
const REPORT_DIR = path.join(__dirname, '..', 'report');
const scripts = {
  login: 'tests/load/k6-login.js',
  orders: 'tests/load/k6-orders.js',
  mixed: 'tests/load/k6-mixed.js'
};

function runK6(script) {
  return new Promise((resolve, reject) => {
    const reportPath = path.join(REPORT_DIR, 'load-' + script + '.json');
    const k6 = spawn('k6', ['run', '--out', 'json=' + reportPath, script], {
      cwd: path.join(__dirname, '..', '..'),
      env: { ...process.env, API_URL, LOGIN_EMAIL: process.env.LOGIN_EMAIL || 'e2e-admin@test.com', LOGIN_PASSWORD: process.env.LOGIN_PASSWORD || 'admin123' },
      stdio: 'inherit'
    });
    k6.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('k6 not found. Install it from https://k6.io/docs/get-started/installation/');
        console.error('  e.g. Windows (choco): choco install k6');
        console.error('  e.g. npm (global):    npm install -g k6');
        reject(new Error('k6 not installed or not in PATH'));
      } else {
        reject(err);
      }
    });
    k6.on('close', (code) => (code === 0 ? resolve() : reject(new Error('k6 exited ' + code))));
  });
}

async function main() {
  const arg = process.argv[2] || '--all';
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

  const toRun = arg === '--all' ? Object.keys(scripts) : [arg.replace(/^--/, '')];
  for (const name of toRun) {
    if (!scripts[name]) continue;
    console.log('Running', name + '...');
    try {
      await runK6(scripts[name]);
    } catch (e) {
      console.error(name, 'failed:', e.message);
      process.exit(1);
    }
  }
  console.log('Load tests done. Reports in', REPORT_DIR);
}

main();
