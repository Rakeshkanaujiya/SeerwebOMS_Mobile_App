const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');

function load(file, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => dependencies[name], ...globals });
  return exports;
}

function client(fetch) {
  return load(path.join(root, 'src/lib/partyProductHistory.ts'), {
    '@react-native-async-storage/async-storage': { default: { getItem: async () => 'test-session' } },
    apiurl: { apiUrl: 'https://oms.seerweberp.com/api' },
  }, { fetch });
}
const response = (body, status = 200) => ({ ok: status === 200, status, text: async () => body });
const plain = value => JSON.parse(JSON.stringify(value));

test('requested dealer/customer use the web contract and authenticated deduplicated request', async () => {
  let calls = 0;
  const api = client(async (url, options) => {
    calls++;
    assert.equal(url, 'https://oms.seerweberp.com/api/products/sales-history?dealerid=22363&retailer_id=36724');
    assert.equal(options.headers.Authorization, 'Bearer test-session');
    return response('{"101":{"quantity":7.5,"order_count":2}}');
  });
  const results = await Promise.all([api.fetchPartyProductHistory(22363, 36724), api.fetchPartyProductHistory(22363, 36724)]);
  assert.equal(calls, 1);
  assert.deepEqual(plain(results[0]), { 101: { quantity: 7.5, order_count: 2 } });
});

test('empty objects and legacy empty arrays succeed; malformed successes and server errors reject', async () => {
  for (const body of ['{}', '[]']) {
    assert.deepEqual(plain(await client(async () => response(body)).fetchPartyProductHistory(22363, 36724)), {});
  }
  for (const [body, status] of [['', 200], ['null', 200], ['{"error":"failed"}', 200], ['[1]', 200], ['<html>failure</html>', 500], ['""', 404]]) {
    await assert.rejects(client(async () => response(body, status)).fetchPartyProductHistory(22363, 36724),
      error => error.name === 'PartyProductHistoryError' && error.status === status);
  }
});

test('in-flight response cannot repopulate cache after successful order invalidates it', async () => {
  let release;
  const api = client(() => new Promise(resolve => { release = resolve; }));
  const request = api.fetchPartyProductHistory(22363, 36724);
  await new Promise(resolve => setImmediate(resolve));
  await api.invalidatePartyProductHistory(22363, 36724);
  release(response('{"101":{"quantity":1,"order_count":1}}'));
  await request;
  assert.equal(await api.cachedPartyProductHistory(22363, 36724), undefined);
});

test('mobile and web produce identical party ranking and default ordering without history', () => {
  const mobile = load(path.join(root, 'src/lib/createOrderProductSort.ts'));
  const web = load(path.resolve(root, '../client/src/lib/createOrderProductSort.ts'));
  const products = [
    { id: 1, name: 'Z Milk', historical_ordered_quantity: 7.5, historical_order_count: 2 },
    { id: 2, name: 'A Milk', historical_ordered_quantity: 7.5, historical_order_count: 3 },
    { id: 3, name: 'A Curd', historical_ordered_quantity: 0 },
    { id: 4, name: 'B Phone 10', attributes: { category: 'Mobile' } },
    { id: 5, name: 'B Phone 2', attributes: { category: 'Mobile' } },
    { id: 6, name: 'A Shirt', attributes: { product_type: 'Garment' } },
  ];
  const ids = result => Array.from(result, product => product.id);
  assert.deepEqual(ids(mobile.sortCreateOrderProducts(products)), [2, 1, 3, 6, 5, 4]);
  for (const items of [products, products.map(({ historical_ordered_quantity, historical_order_count, ...rest }) => rest)]) {
    assert.deepEqual(ids(mobile.sortCreateOrderProducts(items)), ids(web.sortCreateOrderProducts(items)));
    assert.equal(mobile.sortCreateOrderProducts(items).length, products.length);
  }
});
