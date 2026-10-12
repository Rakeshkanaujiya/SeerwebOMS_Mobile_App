type SortableProduct = {
  id: string | number;
  name?: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  historical_ordered_quantity?: number;
  historical_order_count?: number;
};

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function attribute(product: SortableProduct, ...keys: string[]): string {
  const attributes = product.attributes ?? {};
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
    const entry = Object.entries(attributes).find(
      ([name]) => name.toLowerCase().replace(/[\s_-]/g, '') === normalizedKey
    );
    const value = text(entry?.[1]);
    if (value) return value;
  }
  return '';
}

export function createOrderBrand(product: SortableProduct): string {
  const explicit = text(product.brand) || attribute(product, 'brand', 'brand_name');
  if (explicit) return explicit;
  return text(product.name).match(/^[\p{L}\p{N}]+/u)?.[0] || 'Unbranded';
}

function productType(product: SortableProduct): string {
  const explicit = attribute(product, 'product_type', 'dairy_type', 'category', 'stock_group', 'type');
  if (explicit) return explicit;
  const name = text(product.name);
  const brand = createOrderBrand(product);
  const remainder = name.toLowerCase().startsWith(brand.toLowerCase())
    ? name.slice(brand.length).replace(/^[\s\-_/]+/, '')
    : name;
  return remainder.match(/^[\p{L}\p{N}]+/u)?.[0] || 'Other';
}

export function sortCreateOrderProducts<T extends SortableProduct>(products: T[]): T[] {
  return [...products].sort(
    (left, right) =>
      Number(right.historical_ordered_quantity ?? 0) -
        Number(left.historical_ordered_quantity ?? 0) ||
      Number(right.historical_order_count ?? 0) - Number(left.historical_order_count ?? 0) ||
      collator.compare(createOrderBrand(left), createOrderBrand(right)) ||
      collator.compare(productType(left), productType(right)) ||
      collator.compare(text(left.name), text(right.name)) ||
      collator.compare(text(left.id), text(right.id))
  );
}
