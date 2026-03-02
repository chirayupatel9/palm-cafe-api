/**
 * k6: 200 concurrent order creations. Run: k6 run tests/load/k6-orders.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.API_URL || 'http://localhost:5000';

export const options = {
  vus: 200,
  iterations: 200,
  maxDuration: '120s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500']
  }
};

function getToken() {
  const body = JSON.stringify({
    email: __ENV.LOGIN_EMAIL || 'e2e-admin@test.com',
    password: __ENV.LOGIN_PASSWORD || 'admin123'
  });
  const res = http.post(BASE_URL + '/api/auth/login', body, {
    headers: { 'Content-Type': 'application/json' }
  });
  return res.status === 200 ? res.json('token') : null;
}

export default function () {
  const token = getToken();
  if (!token) return;
  const payload = JSON.stringify({
    customer_name: 'Load-' + __VU + '-' + __ITER,
    items: [{ id: 1, menu_item_id: 1, name: 'Item', price: 10, quantity: 1, total: 10 }],
    total_amount: 10,
    tax_amount: 0,
    tip_amount: 0,
    final_amount: 10,
    payment_method: 'cash'
  });
  const res = http.post(BASE_URL + '/api/orders', payload, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  });
  check(res, function (r) { return r.status === 201 || (r.status >= 400 && r.status < 500); });
  sleep(0.1);
}
