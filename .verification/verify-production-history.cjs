// Supply an existing dealer/staff session; never print or persist the token.
const assert = require('node:assert/strict');
const { URL } = require('node:url');
const base = 'https://oms.seerweberp.com/api';
const token = process.env.OMS_TEST_TOKEN;
const emptyCustomer = process.env.OMS_EMPTY_RETAILER_ID;

async function get(endpoint) {
  const response = await fetch(new URL(base + endpoint), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.text();
  assert.equal(response.status, 200, `${endpoint}: HTTP ${response.status}, body ${body.slice(0, 300)}`);
  assert.match(response.headers.get('content-type') || '', /application\/json/i);
  return JSON.parse(body);
}

(async () => {
  assert.ok(token, 'Set OMS_TEST_TOKEN to an existing authorized dealer/staff bearer token.');
  assert.match(emptyCustomer || '', /^\d+$/, 'Set OMS_EMPTY_RETAILER_ID to a verified customer of dealer 22363 with no orders.');
  assert.notEqual(emptyCustomer, '36724', 'Use a distinct known no-history customer.');
  const history = await get('/products/sales-history?dealerid=22363&retailer_id=36724');
  assert.ok(history && !Array.isArray(history) && typeof history === 'object');
  for (const [id, value] of Object.entries(history)) {
    assert.match(id, /^\d+$/);
    assert.ok(Number.isFinite(value.quantity) && Number.isInteger(value.order_count));
  }
  console.log(`Requested customer: HTTP 200 JSON, ${Object.keys(history).length} product history entries.`);
  const empty = await get(`/products/sales-history?dealerid=22363&retailer_id=${emptyCustomer}`);
  assert.deepEqual(empty, {});
  console.log('Verified no-history customer: HTTP 200 {}.');
  const products = await get('/products?dealerid=22363&create_order=1');
  assert.ok(Array.isArray(products));
  console.log(`Products: HTTP 200 JSON, ${products.length} products. Compare history totals with persisted orders before acceptance.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
