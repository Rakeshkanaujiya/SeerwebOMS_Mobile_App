const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const source = fs.readFileSync('screens/sales_executive/ShareItemsScreen.tsx', 'utf8');
const exportsObject = {};
const react = { memo: fn => fn, createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
const native = { StyleSheet: { create: value => value }, View: 'View', Image: 'Image', Pressable: 'Pressable', Text: 'Text' };
vm.runInNewContext(ts.transpileModule(source + '\nexport { buildShareCatalogHtml, buildShareMessage };', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, {
  exports: exportsObject, require(name) {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react-native') return native;
    if (name.includes('/theme')) return { OMS_COLORS: {} };
    if (name.includes('/cart') && !name.includes('Settings')) return { getImageUri: value => value };
    if (name.includes('/images')) return { cachedImageSource: uri => ({ uri }) };
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    return {};
  },
});
function nodes(value) { return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.children)] : [value]; }
for (const image of [null, 'https://example.test/item.png']) {
  test(`share card and exported catalog obey ON/OFF (${image ? 'image' : 'placeholder'})`, () => {
    const product = { id: 1, name: 'Catalog item', price: 25, attributes: {}, variants: [], image };
    for (const showImage of [false, true]) {
      let shared = false, toggled = false;
      const tree = exportsObject.ShareProductCard({ product, selected: true, showImage, showSizes: true, onToggle: () => { toggled = true; }, onShareOne: () => { shared = true; } });
      const all = nodes(tree);
      assert.equal(all.some(n => n?.type === 'Image' || n?.props?.name === 'image-outline'), showImage);
      assert.equal(all.some(n => n?.props?.style?.aspectRatio === 0.9), showImage);
      assert(all.includes('Catalog item'));
      tree.props.onPress();
      all.find(n => n?.type === 'Pressable' && n !== tree).props.onPress({ stopPropagation() {} });
      assert(shared && toggled);
      const html = exportsObject.buildShareCatalogHtml([product], 'Company', showImage, false);
      assert.equal(html.includes('<div class="imageRow"'), showImage);
      assert.equal(html.includes('<img ') || html.includes('<div class="placeholder">'), showImage);
      assert(!html.includes('Available Size Range:'));
      const text = exportsObject.buildShareMessage([product], 'Company', showImage, false);
      assert.equal(text.includes('Images:'), showImage && !!image);
      assert(!text.includes('Available Sizes:'));
    }
  });
}
