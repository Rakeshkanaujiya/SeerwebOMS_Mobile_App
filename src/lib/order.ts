import type { CartItem } from '../../context/CartContext';
import { getCartLinePieceQuantity, type CartProductDetail } from './cart';
import {
  calculateGstSummary,
  roundMoney,
  type GstLineSnapshot,
  type GstSlab,
} from './gst';

export const GARMENT_BUSINESS_TYPE_ID = 2;

export function isGarmentBusiness(businessTypeId: unknown): boolean {
  return Number(businessTypeId) === GARMENT_BUSINESS_TYPE_ID;
}

function isSizeSetOrder(item: CartItem): boolean {
  return item.orderMode === 'size_set';
}

function getSizeSetPieceCount(item: CartItem): number {
  return Math.max(1, item.sizeSetSizes?.length ?? item.garmentMeta?.sizeSetSizes?.length ?? 0);
}

function getCartLineTaxableValue(item: CartItem): number {
  return roundMoney(Number(item.price || 0) * Number(item.quantity || 0));
}

function getGarmentSetCount(cart: CartItem[]): number {
  const explicitSizeSets = cart
    .filter((item) => isGarmentBusiness(item.businessTypeId) && isSizeSetOrder(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const groups = new Map<string, number[]>();

  cart
    .filter((item) => isGarmentBusiness(item.businessTypeId) && !isSizeSetOrder(item))
    .forEach((item) => {
      const key = `${item.productId}::${item.color ?? ''}`;
      const quantities = groups.get(key) ?? [];
      quantities.push(Number(item.quantity || 0));
      groups.set(key, quantities);
    });

  const legacySetCount = Array.from(groups.values()).reduce((sum, quantities) => {
    if (quantities.length === 0) return sum;
    return sum + Math.min(...quantities);
  }, 0);

  return explicitSizeSets + legacySetCount;
}

export function getOrderTotals(
  cart: CartItem[],
  businessTypeId?: unknown,
  gstSlabs: GstSlab[] = []
) {
  const gstSummary = calculateGstSummary(
    cart.map((item) => ({
      key: `${item.productId}-${item.variantId}-${item.color ?? ''}`,
      taxableValue: getCartLineTaxableValue(item),
      slabAmount: Number(item.price || 0),
      gstPercentage: item.attributes && Object.prototype.hasOwnProperty.call(item.attributes, 'gst_percent')
        ? Number(item.attributes.gst_percent)
        : undefined,
    })),
    gstSlabs
  );
  const totalItems = cart.reduce((sum, item) => sum + getCartLinePieceQuantity(item), 0);
  const garmentOrder =
    isGarmentBusiness(businessTypeId) ||
    cart.some((item) => isGarmentBusiness(item.businessTypeId));

  return {
    subtotal: gstSummary.taxableValue,
    taxableValue: gstSummary.taxableValue,
    gst: gstSummary.gstAmount,
    gstPercentage: gstSummary.gstPercentage,
    total: gstSummary.grandTotal,
    totalItems,
    totalSets: garmentOrder ? getGarmentSetCount(cart) : 0,
    productCount: new Set(cart.map((item) => item.productId)).size,
    garmentOrder,
    taxLines: gstSummary.lines,
    hasMissingGstSlab: gstSummary.hasMissingSlab,
  };
}

export function buildOrderItems(
  cart: CartItem[],
  productsById: Record<number, CartProductDetail>,
  taxLines: GstLineSnapshot[] = []
) {
  return cart.map((item, index) => {
    const product = productsById[item.productId];
    const variant =
      item.variantId !== 0
        ? product?.variants?.find((entry) => String(entry.id) === String(item.variantId))
        : undefined;
    const businessTypeId = item.businessTypeId ?? product?.business_type_id ?? null;
    const garmentOrder = isGarmentBusiness(businessTypeId);
    const attributes = item.attributes ?? product?.attributes ?? {};
    const taxLine = taxLines[index];
    const subtotal = getCartLineTaxableValue(item);
    const lineMrp = Number(item.mrp ?? variant?.mrp ?? attributes.mrp ?? item.price ?? 0);
    const isSizeSet = isSizeSetOrder(item);
    const sizeSetPieceCount = isSizeSet ? getSizeSetPieceCount(item) : 1;
    const totalPieces = Number(item.quantity || 0) * sizeSetPieceCount;
    const taxSnapshot = {
      taxable_value: taxLine?.taxableValue ?? subtotal,
      gst_percentage: taxLine?.gstPercentage ?? 0,
      gst_amount: taxLine?.gstAmount ?? 0,
      gst_slab_id: taxLine?.gstSlabId ?? null,
      gst_slab_name: taxLine?.gstSlabName ?? null,
      gst_slab_min_amount: taxLine?.gstSlabMinAmount ?? null,
      gst_slab_max_amount: taxLine?.gstSlabMaxAmount ?? null,
    };

    return {
      productId: item.productId,
      variantId: item.variantId,
      size: item.size ?? variant?.size ?? '',
      color: item.color ?? variant?.color ?? '',
      quantity: item.quantity,
      price: item.price,
      subtotal,
      rack: item.rack ?? variant?.rack ?? '',
      ...taxSnapshot,
      attributes_snapshot: {
        ...attributes,
        brand: item.brand ?? product?.brand ?? '',
        model: item.model ?? product?.model ?? '',
        business_type_id: businessTypeId,
        mrp: lineMrp,
        ordered_quantity: item.quantity,
        total_pieces: totalPieces,
        line_rate: item.price,
        line_mrp: lineMrp,
        line_rate_total: subtotal,
        line_mrp_total: roundMoney(lineMrp * Number(item.quantity || 0)),
        order_mode: item.orderMode,
        size_set_id: item.sizeSetId,
        size_set_name: item.sizeSetName,
        size_set_sizes: item.sizeSetSizes,
        size_set_piece_count: isSizeSet ? sizeSetPieceCount : undefined,
        size_set_quantity: isSizeSet ? item.quantity : undefined,
        size_set_rate_total: isSizeSet ? subtotal : undefined,
        size_set_mrp_total: isSizeSet ? roundMoney(lineMrp * Number(item.quantity || 0)) : undefined,
        ...taxSnapshot,
        ...(garmentOrder
          ? {
              garment_meta: {
                ...(item.garmentMeta ?? {}),
                selectedColor: item.color ?? variant?.color ?? item.garmentMeta?.selectedColor,
                selectedImage: item.image ?? item.garmentMeta?.selectedImage,
                selectedSku: item.garmentMeta?.selectedSku,
                designNumber: item.garmentMeta?.designNumber,
                selectedPrice: item.price,
                selectedMrp: lineMrp,
                selectedStock: item.stock ?? item.garmentMeta?.selectedStock,
                orderMode: item.orderMode,
                sizeSetId: item.sizeSetId,
                sizeSetName: item.sizeSetName,
                sizeSetSizes: item.sizeSetSizes,
                sizeSetPieceCount,
                sizeSetQuantity: isSizeSet ? item.quantity : undefined,
                totalPieces,
              },
              set_quantity: item.setQuantity ?? (isSizeSet ? item.quantity : 0),
            }
          : {}),
      },
    };
  });
}
