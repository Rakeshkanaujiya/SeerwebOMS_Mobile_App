const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
let slots = [], cursor = 0;
const react = {
  useMemo: fn => fn(), useEffect: () => {}, useCallback: fn => fn,
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  createElement: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children }) : ({ type, props: props || {}, children }),
};
const native = Object.fromEntries(['View', 'Image', 'Text', 'TextInput', 'Pressable'].map(name => [name, name]));
native.StyleSheet = { create: value => value };
function load(file, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, { exports, Error, __DEV__: false, require: name => modules[name] });
  return exports;
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value === 'boolean') return [];
  if (typeof value !== 'object') return [value];
  if ([value.props?.style].flat(Infinity).some(style => style?.display === 'none')) return [];
  return [value, ...nodes(value.children)];
}
const shared = { react: { ...react, default: react }, 'react-native': native, '@expo/vector-icons': { Feather: 'Icon' }, apiurl: { apiUrl: 'https://oms.seerweberp.com/api' }, '../src/lib/theme': { OMS_COLORS: {} } };
const fields = load('src/lib/dealerSettings.ts', { './services/api': {}, '@react-native-async-storage/async-storage': {} });
const settings = load('src/lib/cartSettings.ts', { react: shared.react, '@react-navigation/native': { useFocusEffect: () => {} }, './dealerSettings': fields, './services/api': {}, '@react-native-async-storage/async-storage': {}, apiurl: shared.apiurl });
const ProductCard = load('components/ProductCart.tsx', { ...shared, '../src/lib/dealerSettings': fields, '../src/lib/cartSettings': settings, '../src/lib/images': { cachedImageSource: uri => ({ uri }) } }).default;
for (const business of [1, 2, 3]) test(`product visibility survives for business ${business}`, () => {
  slots = []; cursor = 0;
  const product = { id: 1, name: 'Test item', price: 25, stock: 8, dealerid: 1, business_type_id: business, attributes: {}, variants: business === 3 ? [] : [{ id: 1, size: 'M', qty: 8, rate: 25 }] };
  const schema = ['product_name', 'selling_price', 'product_image', 'brand', 'category', 'size'].map(field_key => ({ field_key, is_visible: 1, is_deleted: 0 }));
  const props = { product, schemaFields: schema, cart: [], onAddSimple() {}, onAddVariant() {}, onUpdateVariantQty() {}, onRemoveVariant() {}, onUpdateSimpleQty() {}, onRemoveSimple() {} };
  const hidden = nodes(ProductCard({ ...props, schemaFields: schema.map(field => ({ ...field, is_visible: 0 })), cartSettings: { ...settings.DEFAULT_CART_SETTINGS, visibleDetails: Object.fromEntries(Object.keys(settings.DEFAULT_CART_SETTINGS.visibleDetails).map(key => [key, false])) } }));
  assert(!hidden.some(node => node.type === 'Image' || node.type === 'TextInput'));
  assert(!hidden.includes('Test item'));
  assert(!hidden.some(node => typeof node === 'string' && node.includes('₹')));
  slots = []; cursor = 0;
  const shown = nodes(ProductCard(props));
  assert(shown.includes('Test item'));
  assert(shown.some(node => node.type === 'TextInput'));
});
test('cart manual input accepts large quantities and commits incomplete edits like Web', () => {
  const CartLine = load('components/CartLineItem.tsx', { ...shared, '../src/lib/cartSettings': settings, '../src/lib/app': { formatCurrency: value => `₹${value}` } }).default;
  slots = []; const quantities = [];
  const props = { row: { quantity: 2, name: 'Test item', price: 25, subtotal: 50 }, onQuantityChange: value => quantities.push(value), onIncrement() {}, onDecrement() {}, onRemove() {} };
  function input() { cursor = 0; return nodes(CartLine(props)).find(node => node.type === 'TextInput'); }
  input().props.onChangeText('1001');
  assert.equal(quantities.at(-1), 1001);
  input().props.onChangeText('');
  assert.equal(quantities.at(-1), 1001, 'Blank draft must not remove a cart line');
  input().props.onBlur();
  assert.equal(quantities.at(-1), 1);
});
