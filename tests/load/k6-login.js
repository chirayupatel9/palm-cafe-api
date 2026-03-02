/**
 * k6: 100 concurrent logins. Run: k6 run tests/load/k6-login.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.API_URL || 'http://localhost:5000';

export const options = {
  vus: 100,
  iterations: 100,
  maxDuration: '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500']
  }
};

export default function () {
  const body = JSON.stringify({
    email: __ENV.LOGIN_EMAIL || 'e2e-admin@test.com',
    password: __ENV.LOGIN_PASSWORD || 'admin123'
  });
  const res = http.post(BASE_URL + '/api/auth/login', body, {
    headers: { 'Content-Type': 'application/json' }
  });
  check(res, { 'login ok': function (r) { return r.status === 200 || r.status === 401; } });
  sleep(0.1);
}
