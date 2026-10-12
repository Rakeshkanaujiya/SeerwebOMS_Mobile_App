import { cachedGet } from './services/api';
import { mapProductPayload, type CartProductDetail, type CartSnapshotItem } from './cart';

/** Hydrate just the cart IDs; the API owns Tally setting/fallback decisions. */
export async function fetchCartProducts(dealerId: number, partyId: number, ids: string, allowUnavailable = false) {
  const productIds = ids.split(',').filter(Boolean);
  const requests = [];
  for (let offset = 0; offset < productIds.length; offset += 100) {
    requests.push(cachedGet(`/products?dealerid=${dealerId}&ids=${productIds.slice(offset, offset + 100).join(',')}&page=1&per_page=100&create_order=1&retailer_id=${partyId}`));
  }
  const pages = await Promise.all(requests);
  const products: Record<number, CartProductDetail> = {};
  for (const page of pages) {
    if (!Array.isArray(page?.products)) throw new Error('Unable to refresh cart prices');
    for (const raw of page.products) {
      const product = mapProductPayload(raw);
      if (!Number.isFinite(product.price) || product.price < 0) throw new Error('Invalid product rate');
      products[product.id] = product;
    }
  }
  if (!allowUnavailable && productIds.some(id => !products[Number(id)])) {
    throw new Error('A cart item is no longer available for ordering. Remove it before submitting.');
  }
  return products;
}

/** Merge onto current lines, never a captured cart: quantities may change in flight. */
export function refreshCartPricing<T extends CartSnapshotItem>(items: T[], products: Record<number, CartProductDetail>): T[] {
  return items.map(item => {
    const product = products[item.productId];
    if (!product) return item;
    // Garment color prices and size-set totals are calculated by the existing
    // garment workflow. A single master unit rate must not overwrite a set total.
    const price = Number(Number(item.businessTypeId ?? product.business_type_id) === 2
      ? item.price : product.effective_rate ?? product.price);
    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid product rate');
    return { ...item, price, stock_item_rate: product.stock_item_rate,
      party_rate: product.party_rate, effective_rate: product.effective_rate,
      attributes: { ...item.attributes, ...product.attributes, gst_percent: product.attributes?.gst_percent },
      garmentMeta: item.garmentMeta ? { ...item.garmentMeta, selectedPrice: price } : undefined };
  });
}
