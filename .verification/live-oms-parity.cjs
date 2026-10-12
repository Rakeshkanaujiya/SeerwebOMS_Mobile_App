// Read-only probe. Credentials come from the process environment; no token is saved.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function mobileModule(file, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Error, require: name => modules[name] });
  return exports;
}
const base = 'https://oms.seerweberp.com/api';
async function main() {
  const response = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.OMS_VERIFY_USER, password: process.env.OMS_VERIFY_PASSWORD }) });
  const session = await response.json();
  assert(response.ok && session.token, 'Login failed');
  const user = session.user;
  const dealer = user.role === 'dealer' ? user.id : user.dealer_id;
  const report = { role: user.role, dealer, checks: [], errors: [] };
  async function get(endpoint, required = true) {
    const response = await fetch(base + endpoint, { headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) { const message = `${endpoint}: HTTP ${response.status}`; report.errors.push(message); if (required) throw Error(message); return null; }
    return response.json();
  }
  const [customers, setting, schema, productSettings, gst, cartSettings] = await Promise.all([
    get(`/retailers?dealerid=${dealer}&page=1&per_page=30`), get(`/party-rate-settings?dealerid=${dealer}`),
    get(`/dealer-product-schema?dealer_id=${dealer}&business_type_id=${user.business_type_id}&include_hidden=1`),
    get(`/product-settings?dealerid=${dealer}`), get(`/gst-slabs/active?dealerid=${dealer}`), get(`/cart-settings?dealerid=${dealer}`, false),
  ]);
  assert(Array.isArray(customers.retailers) && customers.pagination);
  const labels = customers.retailers.map(row => String(row.ledger || row.name).trim().toLowerCase());
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  assert(labels.every((label, index) => index === 0 || collator.compare(labels[index - 1], label) <= 0), 'Customer page is not ascending');
  report.checks.push({ customersTotal: customers.pagination.total, customersAscending: true, tallyRatesEnabled: setting.fetch_item_rate_from_tally_sales, schemaFields: schema.schema.length, productSettings: Boolean(productSettings.success), gstSlabs: Array.isArray(gst) ? gst.length : gst.slabs?.length, cartSettingsAvailable: Boolean(cartSettings) });
  const parties = user.role === 'retailer' ? [user.id] : customers.retailers.slice(0, 2).map(row => row.id);
  const cartHelpers = mobileModule('src/lib/cart.ts', { apiurl: { apiUrl: base } });
  const pricingHelpers = mobileModule('src/lib/cartPricing.ts', { './cart': cartHelpers, './services/api': {} });
  const gstHelpers = mobileModule('src/lib/gst.ts', { apiurl: { apiUrl: base } });
  const orderHelpers = mobileModule('src/lib/order.ts', { './cart': cartHelpers, './gst': gstHelpers });
  let previewCart, previewProductId;
  for (const party of parties) {
    const [page, history] = await Promise.all([get(`/products?dealerid=${dealer}&create_order=1&retailer_id=${party}&page=1&per_page=30`), user.role === 'retailer' ? Promise.resolve(null) : get(`/products/sales-history?dealerid=${dealer}&retailer_id=${party}`)]);
    assert(Array.isArray(page.products) && page.products.length);
    for (const p of page.products) {
      assert.equal(Number(p.effective_rate), p.party_rate === null ? Number(p.stock_item_rate) : Number(p.party_rate), 'Effective rate fallback mismatch');
      if (history) assert.equal(Number(p.historical_ordered_quantity || 0), Number(history[p.id]?.quantity || 0));
    }
    // Match PHP's whitespace/punctuation handling exactly, rather than Intl collation.
    execFileSync('C:/xampp/php/php.exe', ['-r', '$rows=json_decode($argv[1],true); for($i=1;$i<count($rows);$i++){ $a=$rows[$i-1];$b=$rows[$i];$c=($b["historical_ordered_quantity"]<=>$a["historical_ordered_quantity"])?:($b["historical_order_count"]<=>$a["historical_order_count"])?:strnatcasecmp(trim($a["name"]),trim($b["name"]))?:($a["id"]<=>$b["id"]); if($c>0)exit(1);}', JSON.stringify(page.products.map(({id,name,historical_ordered_quantity,historical_order_count}) => ({id,name,historical_ordered_quantity,historical_order_count})))], { stdio: 'pipe' });
    const ids = page.products.slice(0, 3).map(p => p.id).join(',');
    const cart = await get(`/products?dealerid=${dealer}&ids=${ids}&create_order=1&retailer_id=${party}&page=1&per_page=100`);
    assert.equal(cart.products.length, 3);
    const search = await get(`/products?dealerid=${dealer}&create_order=1&retailer_id=${party}&search=${encodeURIComponent(page.products[0].name)}&page=1&per_page=30`);
    assert(search.products.some(p => String(p.id) === String(page.products[0].id)), 'Product search lost exact match');
    if (!previewProductId) { previewProductId = Number(page.products[1].id); previewCart = [cartHelpers.createCartSnapshotItem(cartHelpers.mapProductPayload(page.products[1]), 7)]; }
    const selected = await get(`/products?dealerid=${dealer}&ids=${previewProductId}&create_order=1&retailer_id=${party}&page=1&per_page=100`);
    const product = cartHelpers.mapProductPayload(selected.products[0]);
    previewCart = pricingHelpers.refreshCartPricing(previewCart, { [previewProductId]: product });
    assert.equal(previewCart[0].quantity, 7);
    const totals = orderHelpers.getOrderTotals(previewCart, user.business_type_id, gstHelpers.normalizeGstSlabs(gst));
    const items = orderHelpers.buildOrderItems(previewCart, { [previewProductId]: product }, totals.taxLines);
    report.checks.push({ localOrderPreviewOnly: true, party, productId: previewProductId, quantity: 7, rate: items[0].price, taxableValue: totals.taxableValue, gst: totals.gst, total: totals.total, missingGst: totals.hasMissingGstSlab });
    report.checks.push({ party, productsTotal: page.pagination.total, productPageRows: page.products.length, historyItems: history ? Object.keys(history).length : 'retailer uses embedded history', sorted: true, effectiveRates: true, targetedCartIds: cart.products.length, search: true, partyRatesOnPage: page.products.filter(p => p.party_rate !== null).length });
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
