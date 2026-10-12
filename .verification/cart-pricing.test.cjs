const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
function load(name, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Error, require: name => modules[name] });
  return exports;
}
const cart = load('src/lib/cart.ts', { apiurl: { apiUrl: 'https://oms.seerweberp.com/api' } });
const pricing = load('src/lib/cartPricing.ts', { './cart': cart, './services/api': {} });
test('customer rates including zero refresh without changing quantities/identity; no old-party fallback', () => {
  const lines = [{ productId: 1, variantId: 0, price: 40, quantity: 7, attributes: { gst_percent: 18 } }];
  const refreshed = pricing.refreshCartPricing(lines, { 1: { price: 0, effective_rate: 0, stock_item_rate: 30, party_rate: 0, attributes: { gst_percent: 5 } } });
  assert.equal(refreshed[0].price, 0);
  assert.equal(refreshed[0].quantity, 7);
  assert.equal(refreshed[0].attributes.gst_percent, 5);
  assert.equal(lines[0].price, 40);
  const fallback = pricing.refreshCartPricing(refreshed, { 1: { price: 30, effective_rate: 30, party_rate: null, attributes: {} } });
  assert.equal(fallback[0].price, 30);
  assert.equal(fallback[0].attributes.gst_percent, undefined);
});
test('garment set total and size/color/quantity survive pricing refresh', () => {
  const item = { productId: 1, variantId: 'set-M-L', color: 'Blue', price: 300, quantity: 3, businessTypeId: 2, orderMode: 'size_set', sizeSetSizes: ['M', 'L'] };
  const next = pricing.refreshCartPricing([item], { 1: { price: 100, effective_rate: 100, attributes: {} } })[0];
  assert.equal(next.price, 300);
  assert.equal(next.quantity, 3);
  assert.equal(next.color, 'Blue');
  assert.equal(cart.getCartLinePieceQuantity(next), 6);
});
test('only cart IDs downloaded in bounded parallel requests; missing products block', async () => {
  const calls = [];
  const client = load('src/lib/cartPricing.ts', { './cart': cart, './services/api': { cachedGet: async endpoint => {
    calls.push(endpoint);
    return { products: new URL('https://example.test'+endpoint).searchParams.get('ids').split(',').map(id => ({ id, price: 25, effective_rate: 25 })) };
  } } });
  const ids = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
  const result = await client.fetchCartProducts(12, 34, ids);
  assert.equal(Object.keys(result).length, 101);
  assert.equal(calls.length, 2);
  assert(calls.every(url => url.includes('create_order=1&retailer_id=34')));
  const missing = load('src/lib/cartPricing.ts', { './cart': cart, './services/api': { cachedGet: async () => ({ products: [] }) } });
  await assert.rejects(missing.fetchCartProducts(12, 34, '1'), /no longer available/);
});
test('GST and payload use refreshed snapshots', () => {
  const gst = load('src/lib/gst.ts', { apiurl: {} });
  const order = load('src/lib/order.ts', { './cart': cart, './gst': gst });
  const lines = pricing.refreshCartPricing([{ productId: 1, variantId: 0, quantity: 4, price: 30 }], { 1: { price: 25, effective_rate: 25, attributes: { gst_percent: 5 } } });
  const totals = order.getOrderTotals(lines, 3, []);
  assert.equal(totals.taxableValue, 100);
  assert.equal(totals.gst, 5);
  assert.equal(totals.total, 105);
  const payload = order.buildOrderItems(lines, {}, totals.taxLines)[0];
  assert.equal(payload.price, 25);
  assert.equal(payload.quantity, 4);
  assert.equal(payload.gst_amount, 5);
});
test('rapid customer switch ignores old responses and pricing failure stays blocked', async () => {
  const slots = [], effects = [], requests = [], applied = [];
  let cursor = 0, dirty = false, party = 10, result;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; dirty = true; }]; },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) { old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const state = { cart: [{ productId: 1, quantity: 7 }], refreshPrices: products => applied.push(products) };
  const hook = load('src/lib/useCartPricing.ts', {
    react: hooks, '@react-navigation/native': { useFocusEffect: () => {} },
    '../../context/CartContext': { useCart: () => state },
    './cartPricing': { fetchCartProducts: (dealer, party, ids) => new Promise((resolve, reject) => requests.push({ party, ids, resolve, reject })) },
  }).useCartPricing;
  function render() { do { dirty = false; cursor = 0; result = hook(1, party); while (effects.length) effects.shift()(); } while (dirty); }
  async function flush() { await new Promise(resolve => setImmediate(resolve)); render(); }
  render(); party = 20; render();
  requests[1].resolve({ 1: { price: 25 } }); await flush();
  requests[0].resolve({ 1: { price: 99 } }); await flush();
  assert.equal(applied.length, 1);
  assert.equal(result.products[1].price, 25);
  state.cart[0].quantity = 9; render();
  assert.equal(requests.length, 2, 'Quantity changes must not reload products');
  party = 30; render(); requests[2].reject(new Error('offline')); await flush();
  assert.equal(result.loading, false);
  assert.equal(result.error, 'offline');
  assert.equal(applied.length, 1);
});
