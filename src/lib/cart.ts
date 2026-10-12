import { apiUrl } from 'apiurl';

export interface CartSnapshotItem {
  productId: number;
  variantId: number | string;
  size?: string;
  color?: string;
  price: number;
  stock_item_rate?: number;
  party_rate?: number | null;
  effective_rate?: number;
  quantity: number;
  stock?: number;
  productName?: string;
  image?: string | null;
  brand?: string;
  model?: string;
  businessTypeId?: number | null;
  attributes?: Record<string, any>;
  rack?: string;
  setQuantity?: number;
  orderMode?: 'piece' | 'size_set';
  sizeSetId?: string;
  sizeSetName?: string;
  sizeSetSizes?: string[];
  mrp?: number;
  garmentMeta?: {
    designNumber?: string;
    fabricType?: string;
    bookingType?: string;
    selectedColor?: string;
    selectedImage?: string;
    selectedSku?: string;
    selectedPrice?: number;
    selectedStock?: number;
    selectedSizes?: string[];
    sizeSetSizes?: string[];
    productTags?: string[];
    galleryImages?: string[];
  };
}

export interface CartProductVariant {
  id: number | string;
  size?: string;
  color?: string;
  rate?: number;
  mrp?: number;
  qty: number;
  rack?: string;
}

export interface CartProductDetail {
  id: number;
  name: string;
  brand?: string;
  model?: string;
  price: number;
  stock_item_rate?: number;
  party_rate?: number | null;
  effective_rate?: number;
  stock: number;
  image?: string | null;
  color?: string;
  business_type_id?: number | null;
  attributes?: Record<string, any>;
  variants?: CartProductVariant[];
  size_sets?: {
    id: string;
    name: string;
    sizeSystemKey?: string;
    sizes: string[];
  }[];
}

export interface CartRow {
  key: string;
  productId: number;
  variantId: number | string;
  name: string;
  brand: string;
  model: string;
  variantLabel: string | null;
  price: number;
  quantity: number;
  subtotal: number;
  maxQuantity: number;
  availableStock: number;
  imageUri: string | null;
  categoryLabel: 'Garments' | 'Mobile';
  isVariantBased: boolean;
  isOutOfStock: boolean;
  sizeLabel: string | null;
  colorLabel: string | null;
  orderMode?: 'piece' | 'size_set';
  sizeSetId?: string;
  sizeSetName?: string;
  sizeSetSizes?: string[];
}

export interface GarmentGroupSize {
  key: string;
  variantId: number | string;
  sizeLabel: string;
  quantity: number;
  maxQuantity: number;
  availableStock: number;
  price: number;
  subtotal: number;
}

export interface GarmentCartGroup {
  key: string;
  kind: 'garment-group';
  productId: number;
  name: string;
  brand: string;
  model: string;
  imageUri: string | null;
  categoryLabel: 'Garments' | 'Mobile';
  colorLabel: string | null;
  totalQuantity: number;
  subtotal: number;
  maxSetCount: number;
  sizeSummary: string;
  sizes: GarmentGroupSize[];
}

export interface SimpleCartDisplayItem extends CartRow {
  kind: 'simple-row';
}

export type CartDisplayItem = SimpleCartDisplayItem | GarmentCartGroup;

export interface CreateCartLineOptions {
  color?: string;
  setQuantity?: number;
  selectedSizes?: string[];
  image?: string;
  sku?: string;
  price?: number;
  stock?: number;
  designNumber?: string;
  orderMode?: 'piece' | 'size_set';
  sizeSetId?: string;
  sizeSetName?: string;
  sizeSetSizes?: string[];
}

export function createCartSnapshotItem(
  product: CartProductDetail,
  quantity: number,
  variant?: CartProductVariant,
  options: CreateCartLineOptions = {}
): CartSnapshotItem {
  const attributes = product.attributes ?? {};
  const businessTypeId = product.business_type_id ?? null;
  const color =
    options.color ??
    variant?.color ??
    product.color ??
    String(attributes.color ?? '');
  const price = Number(options.price ?? product.party_rate ?? product.effective_rate ?? variant?.rate ?? variant?.mrp ?? product.price ?? 0);

  return {
    productId: product.id,
    variantId: variant?.id ?? 0,
    size: variant?.size ?? String(attributes.size ?? ''),
    color,
    price,
    mrp: Number(variant?.mrp ?? attributes.mrp ?? product.price ?? price),
    quantity,
    stock: Number(options.stock ?? variant?.qty ?? product.stock ?? 0),
    rack: variant?.rack ?? String(attributes.rack ?? attributes.rack_number ?? ''),
    productName: product.name,
    image: options.image ?? product.image ?? null,
    brand: product.brand ?? String(attributes.brand ?? ''),
    model: product.model ?? String(attributes.model ?? ''),
    businessTypeId,
    attributes,
    setQuantity: options.setQuantity,
    orderMode: options.orderMode,
    sizeSetId: options.sizeSetId,
    sizeSetName: options.sizeSetName,
    sizeSetSizes: options.sizeSetSizes,
    garmentMeta:
      Number(businessTypeId) === 2
        ? {
            designNumber: options.designNumber ?? String(attributes.design_number ?? attributes.design ?? ''),
            fabricType: String(attributes.fabric_type ?? attributes.fabric ?? ''),
            bookingType: String(attributes.booking_type ?? ''),
            selectedColor: color,
            selectedImage: options.image,
            selectedSku: options.sku,
            selectedPrice: price,
            selectedStock: options.stock,
            selectedSizes:
              options.selectedSizes ??
              options.sizeSetSizes ??
              (variant?.size ? [variant.size] : []),
            productTags: Array.isArray(attributes.product_tags)
              ? attributes.product_tags.map(String)
              : [],
            galleryImages: [
              ...(options.image ? [options.image] : []),
              ...(Array.isArray(attributes.gallery_images)
                ? attributes.gallery_images.map(String)
                : []),
            ],
          }
        : undefined,
  };
}

export function clampCartQuantity(quantity: number, stock?: number | null): number {
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
}

export function getCartLinePieceQuantity(item: {
  quantity?: number;
  orderMode?: 'piece' | 'size_set';
  sizeSetSizes?: string[];
  garmentMeta?: { sizeSetSizes?: string[] };
}): number {
  const quantity = Number(item.quantity || 0);
  const setPieceCount =
    item.orderMode === 'size_set'
      ? Math.max(
          1,
          item.sizeSetSizes?.length ?? item.garmentMeta?.sizeSetSizes?.length ?? 0
        )
      : 1;

  return quantity * setPieceCount;
}

export function getImageUri(image?: string | null): string | null {
  if (!image) return null;
  if (image.startsWith('http')) return image;
  return `${apiUrl}/${image}`;
}

function getVariantStock(item: CartSnapshotItem, product?: CartProductDetail): number {
  if (item.orderMode === 'size_set') {
    return Number(item.stock ?? 0);
  }

  if (item.variantId !== 0) {
    const variant = product?.variants?.find((entry) => String(entry.id) === String(item.variantId));
    return Number(variant?.qty ?? item.stock ?? 0);
  }

  return Number(product?.stock ?? item.stock ?? 0);
}

function getCategoryLabel(
  product?: CartProductDetail,
  item?: CartSnapshotItem
): 'Garments' | 'Mobile' {
  if (Number(item?.businessTypeId ?? product?.business_type_id) === 2) {
    return 'Garments';
  }

  return 'Mobile';
}

function getSizeSortValue(sizeLabel: string): number {
  const value = sizeLabel.trim().toUpperCase();
  const orderedSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];
  const index = orderedSizes.indexOf(value);
  if (index >= 0) return index;
  return orderedSizes.length + value.charCodeAt(0);
}

export function mapProductPayload(item: any): CartProductDetail {
  let attributes: Record<string, string> = {};

  if (item?.attributes) {
    attributes =
      typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
  }

  return {
    id: Number(item.id),
    name: item.name || '',
    brand: item.brand || attributes.brand || '',
    model: item.model || attributes.model || '',
    price: Number(item.effective_rate ?? item.price ?? 0),
    stock_item_rate: item.stock_item_rate == null ? undefined : Number(item.stock_item_rate),
    party_rate: item.party_rate == null ? undefined : Number(item.party_rate),
    effective_rate: item.effective_rate == null ? undefined : Number(item.effective_rate),
    stock: Number(item.stock ?? 0),
    image: item.image || null,
    color: item.color || attributes.color || '',
    business_type_id: item.business_type_id ?? null,
    attributes,
    variants: Array.isArray(item.variants) ? item.variants : [],
    size_sets: Array.isArray(item.size_sets)
      ? item.size_sets
      : Array.isArray(attributes.selected_size_sets)
        ? attributes.selected_size_sets
        : [],
  };
}

export function buildCartRows(
  cart: CartSnapshotItem[],
  productsById: Record<number, CartProductDetail>
): CartRow[] {
  return cart
    .map((item) => {
      const product = productsById[item.productId];
      if (!product && !item.productName) return null;
      const productVariant =
        item.variantId !== 0
          ? product?.variants?.find((entry) => String(entry.id) === String(item.variantId))
          : undefined;
      const isSizeSet = item.orderMode === 'size_set';

      const availableStock = Math.max(0, getVariantStock(item, product));
      const sizeLabel = isSizeSet
        ? String(item.sizeSetName ?? item.size ?? 'Size set').trim()
        : item.size
        ? String(item.size).trim()
        : productVariant?.size
          ? String(productVariant.size).trim()
          : null;
      const colorLabel = item.color
        ? String(item.color).trim()
        : productVariant?.color
          ? String(productVariant.color).trim()
          : null;
      const variantLabel = isSizeSet
        ? [
            `Size Set: ${sizeLabel ?? 'Size set'}`,
            colorLabel,
          ].filter(Boolean).join(' / ')
        : item.size || item.color || productVariant?.size || productVariant?.color
          ? [item.size ?? productVariant?.size, item.color ?? productVariant?.color]
              .filter(Boolean)
              .join(' / ')
          : null;

      return {
        key: `${item.productId}-${String(item.variantId)}-${item.color ?? ''}-${item.sizeSetId ?? ''}`,
        productId: item.productId,
        variantId: item.variantId,
        name: item.productName || product?.name || `Product #${item.productId}`,
        brand: item.brand || product?.brand || '',
        model: item.model || product?.model || '',
        variantLabel,
        price: Number(item.price ?? 0),
        quantity: Number(item.quantity ?? 0),
        subtotal: Number(item.price ?? 0) * Number(item.quantity ?? 0),
        maxQuantity: Number.MAX_SAFE_INTEGER,
        availableStock,
        imageUri: getImageUri(item.image ?? product?.image),
        categoryLabel: getCategoryLabel(product, item),
        isVariantBased: item.variantId !== 0,
        isOutOfStock: false,
        sizeLabel,
        colorLabel,
        orderMode: item.orderMode,
        sizeSetId: item.sizeSetId,
        sizeSetName: item.sizeSetName,
        sizeSetSizes: item.sizeSetSizes,
      } satisfies CartRow;
    })
    .filter(Boolean) as CartRow[];
}

export function buildCartDisplayItems(
  rows: CartRow[],
  productsById: Record<number, CartProductDetail>
): CartDisplayItem[] {
  const displayItems: CartDisplayItem[] = [];
  const garmentGroups = new Map<string, GarmentCartGroup>();

  rows.forEach((row) => {
    if (row.categoryLabel !== 'Garments' || !row.isVariantBased || row.orderMode === 'size_set') {
      displayItems.push({
        ...row,
        kind: 'simple-row',
      });
      return;
    }

    const groupKey = `${row.productId}::${row.colorLabel ?? ''}`;
    const existingGroup = garmentGroups.get(groupKey);

    if (!existingGroup) {
      const group: GarmentCartGroup = {
        key: groupKey,
        kind: 'garment-group',
        productId: row.productId,
        name: row.name,
        brand: row.brand,
        model: row.model,
        imageUri: row.imageUri,
        categoryLabel: 'Garments',
        colorLabel: row.colorLabel,
        totalQuantity: row.quantity,
        subtotal: row.subtotal,
        maxSetCount: row.maxQuantity,
        sizeSummary: row.sizeLabel ? `1 set = ${row.sizeLabel}` : '',
        sizes: [
          {
            key: row.key,
            variantId: row.variantId,
            sizeLabel: row.sizeLabel || 'NA',
            quantity: row.quantity,
            maxQuantity: row.maxQuantity,
            availableStock: row.availableStock,
            price: row.price,
            subtotal: row.subtotal,
          },
        ],
      };

      garmentGroups.set(groupKey, group);
      displayItems.push(group);
      return;
    }

    existingGroup.totalQuantity += row.quantity;
    existingGroup.subtotal += row.subtotal;
    existingGroup.maxSetCount = Math.min(existingGroup.maxSetCount, row.maxQuantity);
    existingGroup.sizes.push({
      key: row.key,
      variantId: row.variantId,
      sizeLabel: row.sizeLabel || 'NA',
      quantity: row.quantity,
      maxQuantity: row.maxQuantity,
      availableStock: row.availableStock,
      price: row.price,
      subtotal: row.subtotal,
    });
  });

  displayItems.forEach((item) => {
    if (item.kind !== 'garment-group') return;

    item.sizes.sort(
      (left, right) => getSizeSortValue(left.sizeLabel) - getSizeSortValue(right.sizeLabel)
    );

    const setCount =
      item.sizes.length > 0 ? Math.min(...item.sizes.map((entry) => entry.quantity)) : 0;

    item.maxSetCount = setCount;
    item.sizeSummary = `${setCount} ${
      setCount === 1 ? 'set' : 'sets'
    } = ${item.sizes.map((entry) => entry.sizeLabel).join(' + ')}`;
  });

  return displayItems;
}
