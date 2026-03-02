/**
 * k6 mixed workload: 60% read, 30% orders, 10% admin.
 * Run: k6 run tests/load/k6-mixed.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.API_URL || 'http://localhost:5000';

export const options = {
  scenarios: {
    read: {
      executor: 'constant-vus',
      vus: 60,
      duration: '30s',
      startTime: '0s',
      exec: 'read'
    },
    orders: {
      executor: 'constant-vus',
      vus: 30,
      duration: '30s',
      startTime: '0s',
      exec: 'orders'
    },
    admin: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      startTime: '0s',
      exec: 'admin'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500']
  }
};

function getToken() {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: __ENV.LOGIN_EMAIL || 'e2e-admin@test.com',
    password: __ENV.LOGIN_PASSWORD || 'admin123'
  }), { headers: { 'Content-Type': 'application/json' } });
  return res.status === 200 ? res.json('token') : null;
}

export function read() {
  const token = getToken();
  if (!token) return;
  const r1 = http.get(`${BASE_URL}/api/menu`, { headers: { Authorization: `Bearer ${token}` } });
  const r2 = http.get(`${BASE_URL}/api/orders`, { headers: { Authorization: `Bearer ${token}` } });
  check(r1, { 'menu ok': (r) => r.status === 200 });
  check(r2, { 'orders ok': (r) => r.status === 200 });
  sleep(0.5);
}

export function orders() {
  const token = getToken();
  if (!token) return;
  const payload = JSON.stringify({
    customer_name: `Mixed-${__VU}-${Date.now()}`,
    items: [{ id: 1, menu_item_id: 1, name: 'Item', price: 10, quantity: 1, total: 10 }],
    total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, payment_method: 'cash'
  });
  const res = http.post(`${BASE_URL}/api/orders`, payload, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  });
  check(res, { 'order 201 or 4xx': (r) => r.status === 201 || (r.status >= 400 && r.status < 500) });
  sleep(0.3);
}

export function admin() {
  const token = getToken();
  if (!token) return;
  const res = http.get(`${BASE_URL}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
  check(res, { 'admin ok': (r) => r.status === 200 || r.status === 403 });
  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'tests/report/load-mixed.json': JSON.stringify(data),
    stdout: [
      '======== Load (mixed) ========',
      `http_req_duration_p95: ${(data.metrics.http_req_duration?.values?.['p(95)'] ?? 0).toFixed(2)}ms`,
      `http_req_failed: ${((data.metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`
    ].join('\n') + '\n'
  };
}
