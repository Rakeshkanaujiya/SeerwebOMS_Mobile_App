import { Alert, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { logScreenError } from './logging';

const A4_LANDSCAPE_WIDTH = 842;
const A4_LANDSCAPE_HEIGHT = 595;

export interface ShareOrderItem {
  productId?: number | string;
  variantId?: number | string | null;
  size?: string | null;
  color?: string | null;
  price?: number;
  quantity: number;
  taxableValue?: number | null;
  gstPercentage?: number | null;
  gstAmount?: number | null;
  gstSlabId?: number | string | null;
  rack?: string | null;
  unit?: string | null;
  attributes_snapshot?: Record<string, any> | null;
  product: {
    name: string;
    price?: number;
    mrp?: number | null;
    rate?: number | null;
  };
}

export interface ShareOrder {
  id: number | string;
  dealerId?: number | string;
  retailerId?: number | string;
  retailerName?: string | null;
  retailerStoreName?: string | null;
  retailerPhone?: string | null;
  retailerAddress?: string | null;
  retailer_phone?: string | null;
  retailer_address?: string | null;
  ledger?: string | null;
  ledgerName?: string | null;
  dealerCompanyName?: string | null;
  dealer_company?: string | null;
  dealer_company_name?: string | null;
  companyName?: string | null;
  dealerPhone?: string | null;
  dealerAddress?: string | null;
  dealer_phone?: string | null;
  dealer_address?: string | null;
  order_by?: string | null;
  order_by_name?: string | null;
  order_by_phone?: string | null;
  order_by_address?: string | null;
  total: number;
  taxableValue?: number | null;
  gstPercentage?: number | null;
  gstAmount?: number | null;
  status?: string;
  createdAt: string;
  items: ShareOrderItem[];
  notes?: string | null;
  business_type_id?: number | string | null;
  businessTypeId?: number | string | null;
}

interface DairyOrderItem {
  srNo: number;
  product: string;
  brand: string;
  packSizeUnit: string;
  packaging: string;
  qty: number;
  rate: number;
  mrp: number;
  gstPercentage: number;
  gstAmount: number;
  taxableAmount: number;
}

interface GroupedSizeLine {
  size: string;
  qty: number;
  rate: number;
  mrp: number;
  gstPercentage: number;
  gstAmount: number;
  piecesPerSet: number;
  totalPieces: number;
  isSizeSet: boolean;
}

interface GroupedOrderItem {
  key: string;
  srNo: number;
  bookingType: string;
  description: string;
  designNo: string;
  setPcs: number | string;
  color?: string;
  sizes: GroupedSizeLine[];
  totalQty: number;
  totalRateAmount: number;
  totalMrpAmount: number;
  totalGstAmount: number;
  isSizeSetOrder: boolean;
}

interface LinePricing {
  rate: number;
  mrp: number;
}

const SIZE_PRIORITY = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL',
  '28', '30', '32', '34', '36', '38', '40', '42', '44', '46',
];

const sizeRank = new Map(SIZE_PRIORITY.map((size, index) => [size, index]));

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function firstPopulatedValue(...values: unknown[]) {
  const value = values.find(
    (candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== ''
  );
  return value === undefined ? '-' : String(value);
}

function sortSizes(sizes: string[]) {
  return [...sizes].sort((left, right) => {
    const leftRank = sizeRank.get(left.toUpperCase());
    const rightRank = sizeRank.get(right.toUpperCase());
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function getSnapshotValue(snapshot: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = snapshot[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }
  }
  return '';
}

function getOrderItemSnapshot(item: ShareOrderItem) {
  return item.attributes_snapshot ?? {};
}

function getOrderItemGarmentMeta(item: ShareOrderItem) {
  const snapshot = getOrderItemSnapshot(item);
  const garmentMeta = snapshot.garment_meta;
  return garmentMeta && typeof garmentMeta === 'object' ? garmentMeta : {};
}

function getSizeSetSizes(item: ShareOrderItem): string[] {
  const snapshot = getOrderItemSnapshot(item);
  const garmentMeta = getOrderItemGarmentMeta(item);
  const sizes = snapshot.size_set_sizes ?? garmentMeta.sizeSetSizes;
  return Array.isArray(sizes) ? sizes.filter(Boolean).map(String) : [];
}

function isSizeSetOrderItem(item: ShareOrderItem) {
  const snapshot = getOrderItemSnapshot(item);
  const garmentMeta = getOrderItemGarmentMeta(item);
  return (
    snapshot.order_mode === 'size_set' ||
    garmentMeta.orderMode === 'size_set' ||
    Boolean(snapshot.size_set_name || garmentMeta.sizeSetName)
  );
}

function getSizeSetPieceCount(item: ShareOrderItem) {
  const snapshot = getOrderItemSnapshot(item);
  const garmentMeta = getOrderItemGarmentMeta(item);
  const savedPieceCount = toNumber(
    snapshot.size_set_piece_count ?? garmentMeta.sizeSetPieceCount,
    0
  );
  if (savedPieceCount > 0) return savedPieceCount;
  return Math.max(1, getSizeSetSizes(item).length);
}

function resolveLinePricing(item: ShareOrderItem): LinePricing {
  const snapshot = getOrderItemSnapshot(item);
  const garmentMeta = getOrderItemGarmentMeta(item);
  const productMrp = toNumber(item.product?.mrp, 0);
  const productRate = toNumber(item.product?.rate, 0);
  const orderPrice = toNumber(item.price, 0);
  const productFallbackPrice = toNumber(item.product?.price, 0);
  const lineRate = toNumber((item as any).rate, 0);
  const lineMrp = toNumber((item as any).mrp, 0);

  if (isSizeSetOrderItem(item)) {
    const piecesPerSet = getSizeSetPieceCount(item);
    const savedRate = toNumber(snapshot.line_rate ?? garmentMeta.selectedPrice, 0);
    const savedMrp = toNumber(snapshot.line_mrp ?? snapshot.mrp ?? garmentMeta.selectedMrp, 0);
    return {
      rate:
        savedRate > 0
          ? savedRate
          : orderPrice || productRate * piecesPerSet || productFallbackPrice * piecesPerSet || 0,
      mrp:
        savedMrp > 0
          ? savedMrp
          : productMrp > 0
            ? productMrp * piecesPerSet
            : productFallbackPrice || orderPrice || 0,
    };
  }

  return {
    rate: productRate > 0 ? productRate : lineRate > 0 ? lineRate : orderPrice || productFallbackPrice || 0,
    mrp: productMrp > 0 ? productMrp : lineMrp > 0 ? lineMrp : productFallbackPrice || orderPrice || 0,
  };
}

function getItemMeta(item: ShareOrderItem) {
  const snapshot = getOrderItemSnapshot(item);
  const garmentMeta = getOrderItemGarmentMeta(item);
  const pricing = resolveLinePricing(item);
  const isSizeSet = isSizeSetOrderItem(item);
  const piecesPerSet = isSizeSet ? getSizeSetPieceCount(item) : 1;

  return {
    bookingType: snapshot.booking_type ?? garmentMeta.booking_type ?? 'Current',
    designNo: snapshot.design_number ?? garmentMeta.design_number ?? garmentMeta.designNumber ?? '-',
    mrp: pricing.mrp,
    rate: pricing.rate,
    setQuantity: isSizeSet ? piecesPerSet : toNumber(snapshot.set_quantity, 0),
    color: item.color ?? garmentMeta.selectedColor ?? snapshot.color ?? '',
    isSizeSet,
    sizeSetName: snapshot.size_set_name ?? garmentMeta.sizeSetName ?? item.size,
    piecesPerSet,
  };
}

function groupOrderItems(order: ShareOrder) {
  const groups = new Map<string, GroupedOrderItem>();

  order.items.forEach((item) => {
    const meta = getItemMeta(item);
    const size = String(meta.isSizeSet ? meta.sizeSetName || item.size || 'Size set' : item.size || 'Single');
    const rate = Number(meta.rate || item.price || item.product?.price || 0);
    const mrp = Number(meta.mrp || rate);
    const orderedQty = Number(item.quantity || 0);
    const totalPieces = orderedQty * (meta.isSizeSet ? meta.piecesPerSet : 1);
    const rateAmount = rate * orderedQty;
    const mrpAmount = mrp * orderedQty;
    const gstPercentage = toNumber(item.gstPercentage ?? item.attributes_snapshot?.gst_percentage, 0);
    const gstAmount = toNumber(item.gstAmount ?? item.attributes_snapshot?.gst_amount, 0);
    const description = item.product?.name || 'Product';
    const groupKey = [
      item.productId,
      description,
      meta.designNo,
      meta.bookingType,
      meta.color,
      meta.isSizeSet ? 'size_set' : 'piece',
    ].join('__');

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        srNo: groups.size + 1,
        bookingType: meta.bookingType,
        description,
        designNo: meta.designNo,
        setPcs: meta.setQuantity,
        color: meta.color,
        sizes: [],
        totalQty: 0,
        totalRateAmount: 0,
        totalMrpAmount: 0,
        totalGstAmount: 0,
        isSizeSetOrder: meta.isSizeSet,
      });
    }

    const group = groups.get(groupKey)!;
    group.isSizeSetOrder = group.isSizeSetOrder || meta.isSizeSet;
    const existingSize = group.sizes.find((entry) => entry.size === size);

    if (existingSize) {
      existingSize.qty += orderedQty;
      existingSize.rate = rate;
      existingSize.mrp = mrp;
      existingSize.gstPercentage =
        existingSize.gstPercentage === gstPercentage ? gstPercentage : 0;
      existingSize.gstAmount += gstAmount;
      existingSize.piecesPerSet = Math.max(existingSize.piecesPerSet, meta.piecesPerSet);
      existingSize.totalPieces += totalPieces;
    } else {
      group.sizes.push({
        size,
        qty: orderedQty,
        rate,
        mrp,
        gstPercentage,
        gstAmount,
        piecesPerSet: meta.piecesPerSet,
        totalPieces,
        isSizeSet: meta.isSizeSet,
      });
    }

    group.totalQty += totalPieces;
    group.totalRateAmount += rateAmount;
    group.totalMrpAmount += mrpAmount;
    group.totalGstAmount += gstAmount;
    if (meta.isSizeSet) {
      const setPieces = group.sizes
        .filter((entry) => entry.isSizeSet)
        .map((entry) => entry.piecesPerSet);
      group.setPcs = new Set(setPieces).size > 1 ? 'Mixed' : setPieces[0] ?? meta.piecesPerSet;
    } else {
      group.setPcs = Math.max(Number(group.setPcs) || 0, meta.setQuantity);
    }
  });

  const groupedItems = Array.from(groups.values()).map((group) => ({
    ...group,
    sizes: group.isSizeSetOrder
      ? group.sizes
      : sortSizes(group.sizes.map((entry) => entry.size)).map(
          (size) => group.sizes.find((entry) => entry.size === size)!
        ),
  }));

  const allSizeNames = Array.from(
    new Set(groupedItems.flatMap((group) => group.sizes.map((entry) => entry.size)))
  );
  const allSizes = groupedItems.some((group) => group.isSizeSetOrder)
    ? allSizeNames
    : sortSizes(allSizeNames);

  const totals = groupedItems.reduce(
    (accumulator, group) => ({
      totalQty: accumulator.totalQty + group.totalQty,
      totalRateAmount: accumulator.totalRateAmount + group.totalRateAmount,
      totalMrpAmount: accumulator.totalMrpAmount + group.totalMrpAmount,
      totalGstAmount: accumulator.totalGstAmount + group.totalGstAmount,
    }),
    { totalQty: 0, totalRateAmount: 0, totalMrpAmount: 0, totalGstAmount: 0 }
  );

  return { groupedItems, allSizes, totals };
}

function getOrderFinancialTotals(order: ShareOrder, dealerRateSubtotal: number) {
  const savedTaxableValue = toNumber(order.taxableValue, 0);
  const savedGstAmount = toNumber(order.gstAmount, 0);
  const savedGstPercentage = toNumber(order.gstPercentage, 0);
  const savedGrandTotal = toNumber(order.total, 0);
  const taxableSubtotal = savedTaxableValue > 0 ? savedTaxableValue : dealerRateSubtotal;
  const gst =
    savedGstAmount > 0
      ? savedGstAmount
      : savedGrandTotal > taxableSubtotal
        ? savedGrandTotal - taxableSubtotal
        : taxableSubtotal * 0.05;
  const grandTotal = savedGrandTotal > 0 ? savedGrandTotal : taxableSubtotal + gst;

  return {
    dealerRateSubtotal: taxableSubtotal,
    gst,
    grandTotal,
    gstPercentage:
      savedGstPercentage > 0
        ? savedGstPercentage
        : taxableSubtotal > 0
          ? (gst / taxableSubtotal) * 100
          : 0,
  };
}

function getDairyOrderItems(order: ShareOrder) {
  const items: DairyOrderItem[] = order.items.map((item, index) => {
    const snapshot = getOrderItemSnapshot(item);
    const pricing = resolveLinePricing(item);
    const qty = toNumber(item.quantity, 0);
    const rate = toNumber(pricing.rate || item.price || item.product?.price, 0);
    const mrp = toNumber(pricing.mrp || rate, rate);
    const gstPercentage = toNumber(
      item.gstPercentage ?? snapshot.gst_percentage ?? snapshot.gst_percent,
      0
    );
    const savedGstAmount = item.gstAmount ?? snapshot.gst_amount;
    const taxableAmount = rate * qty;
    const gstAmount =
      savedGstAmount !== undefined && savedGstAmount !== null
        ? toNumber(savedGstAmount, 0)
        : (taxableAmount * gstPercentage) / 100;
    const packSize = firstPopulatedValue(
      snapshot.pack_size,
      snapshot.weight_volume,
      snapshot.weight,
      snapshot.volume,
      item.size
    );
    const unit = firstPopulatedValue(
      getSnapshotValue(snapshot, ['unit', 'uom', 'base_unit', 'Unit']),
      item.unit
    );
    const normalizedPack = packSize === '-' ? '' : packSize;
    const normalizedUnit = unit === '-' ? '' : unit;
    const packSizeUnit =
      normalizedPack &&
      normalizedUnit &&
      !normalizedPack.toLowerCase().includes(normalizedUnit.toLowerCase())
        ? `${normalizedPack} ${normalizedUnit}`
        : normalizedPack || normalizedUnit || '-';

    return {
      srNo: index + 1,
      product: item.product?.name || 'Product',
      brand: getSnapshotValue(snapshot, ['brand', 'Brand']) || '-',
      packSizeUnit,
      packaging: getSnapshotValue(snapshot, ['packaging', 'package_type', 'Packaging']),
      qty,
      rate,
      mrp,
      gstPercentage,
      gstAmount,
      taxableAmount,
    };
  });

  const totals = items.reduce(
    (sum, item) => ({
      totalQty: sum.totalQty + item.qty,
      totalTaxableAmount: sum.totalTaxableAmount + item.taxableAmount,
      totalGstAmount: sum.totalGstAmount + item.gstAmount,
    }),
    { totalQty: 0, totalTaxableAmount: 0, totalGstAmount: 0 }
  );

  return { items, totals };
}

function getDairyFinancialTotals(dairyItems: ReturnType<typeof getDairyOrderItems>) {
  const dealerRateSubtotal = toNumber(dairyItems.totals.totalTaxableAmount, 0);
  const gst = toNumber(dairyItems.totals.totalGstAmount, 0);
  return { dealerRateSubtotal, gst, grandTotal: dealerRateSubtotal + gst };
}

function buildOrderShareMessage(order: ShareOrder) {
  const { groupedItems, totals } = groupOrderItems(order);
  const financialTotals = getOrderFinancialTotals(order, totals.totalRateAmount);
  const orderNumber = String(order.id).slice(0, 8);
  const customer = firstPopulatedValue(
    order.ledgerName,
    order.ledger,
    order.ledger,
    order.retailerStoreName,
    order.retailerName
  );

  return [
    `Sales Order #${orderNumber}`,
    `Customer: ${customer}`,
    `Date: ${new Date(order.createdAt).toLocaleString('en-IN')}`,
    '',
    ...groupedItems.map((group) => {
      const sizeSummary = group.sizes
        .map((line) => `${line.size}: ${line.qty}${line.isSizeSet ? ` set/${line.totalPieces} pcs` : ''}`)
        .join('; ');
      return `${group.srNo}. ${group.description} | ${sizeSummary} | Rate Total: Rs.${formatMoney(group.totalRateAmount)}`;
    }),
    '',
    `Total Pieces: ${totals.totalQty}`,
    `Dealer Rate Subtotal: Rs.${formatMoney(financialTotals.dealerRateSubtotal)}`,
    `GST (per item): Rs.${formatMoney(financialTotals.gst)}`,
    `Grand Total: Rs.${formatMoney(financialTotals.grandTotal)}`,
  ].join('\n');
}

export function buildOrderShareHtml(order: ShareOrder, businessTypeId?: number | string | null) {
  const orderDate = new Date(order.createdAt);
  const consigneeName = firstPopulatedValue(
    order.ledgerName,
    order.ledger,
    order.ledger,
    order.retailerStoreName,
    order.retailerName
  );
  const consigneePhone = firstPopulatedValue(order.retailerPhone, order.retailer_phone);
  const consigneeAddress = firstPopulatedValue(order.retailerAddress, order.retailer_address);
  const partyName = firstPopulatedValue(
    order.dealerCompanyName,
    order.dealer_company,
    order.companyName,
    order.order_by_name,
    order.order_by
  );
  const partyPhone = firstPopulatedValue(
    order.dealerPhone,
    order.dealer_phone,
    order.order_by_phone
  );
  const partyAddress = firstPopulatedValue(
    order.dealerAddress,
    order.dealer_address,
    order.order_by_address
  );
  const isDairyBusiness = Number(businessTypeId ?? order.business_type_id ?? order.businessTypeId) === 3;

  if (isDairyBusiness) {
    const { items, totals } = getDairyOrderItems(order);
    const financialTotals = getDairyFinancialTotals({ items, totals });
    const rows = items
      .map(
        (item) => `
          <tr>
            <td>${item.srNo}</td>
            <td class="left"><strong>${escapeHtml(item.product)}</strong></td>
            <td>${escapeHtml(item.brand)}</td>
            <td><strong>${escapeHtml(item.packSizeUnit)}</strong>${item.packaging ? `<small>${escapeHtml(item.packaging)}</small>` : ''}</td>
            <td>${item.qty}</td>
            <td class="money">Rs.${formatMoney(item.rate)}</td>
            <td class="money">Rs.${formatMoney(item.mrp)}</td>
            <td>${formatMoney(item.gstPercentage)}%</td>
            <td class="money">Rs.${formatMoney(item.gstAmount)}</td>
            <td class="money"><strong>Rs.${formatMoney(item.taxableAmount)}</strong></td>
          </tr>`
      )
      .join('');

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Dairy Order ${escapeHtml(order.id)}</title>
          <style>
            @page { size: A4 portrait; margin: 9mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #18342d; font-family: Arial, sans-serif; }
            .sheet { border: 1px solid #b8d6cd; border-radius: 12px; overflow: hidden; }
            .hero { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; color: #fff; background: linear-gradient(135deg, #087f5b, #0f766e); }
            h1 { margin: 0; font-size: 25px; }
            .hero p { margin: 5px 0 0; font-size: 12px; }
            .order-no { padding: 8px 12px; border: 1px solid #ffffff73; border-radius: 8px; text-align: right; font-size: 12px; }
            .details { display: grid; grid-template-columns: 1.4fr 1fr 1fr; border-bottom: 1px solid #b8d6cd; }
            .detail { min-height: 95px; padding: 12px 14px; border-right: 1px solid #dcebe6; }
            .detail:last-child { border: 0; }
            .label { margin-bottom: 7px; color: #0f766e; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
            .value { font-size: 13px; line-height: 1.55; }
            .note { margin: 12px 14px; padding: 9px 11px; border-radius: 7px; background: #f0fdfa; color: #475569; font-size: 12px; }
            .table-wrap { padding: 0 14px; }
            table { width: 100%; border-collapse: collapse; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
            th { padding: 9px 5px; color: #0f5f50; background: #e7f6f1; border: 1px solid #cce4dc; font-size: 9px; text-transform: uppercase; }
            td { padding: 9px 5px; border: 1px solid #dcebe6; font-size: 10px; text-align: center; vertical-align: top; }
            .left { text-align: left; }
            .money { white-space: nowrap; text-align: right; }
            small { display: block; margin-top: 3px; color: #64748b; }
            .total-row td { background: #f0fdfa; font-weight: 700; }
            .footer { display: grid; grid-template-columns: 1.3fr 1fr; margin: 14px; border: 1px solid #b8d6cd; border-radius: 9px; overflow: hidden; }
            .terms { padding: 13px; color: #64748b; font-size: 10px; line-height: 1.55; }
            .totals { padding: 13px; background: #f0fdfa; border-left: 1px solid #b8d6cd; }
            .line { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; }
            .grand { margin-top: 10px; padding-top: 10px; border-top: 2px solid #0f766e; color: #0f5f50; font-size: 16px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="hero"><div><h1>SALES ORDER</h1><p>Dairy &amp; FMCG product invoice</p></div><div class="order-no"><strong>Order #${escapeHtml(String(order.id).slice(0, 8))}</strong><br>${orderDate.toLocaleDateString('en-IN')}</div></div>
            <div class="details">
              <div class="detail"><div class="label">Ledger / Customer</div><div class="value"><strong>${escapeHtml(consigneeName)}</strong><br>${escapeHtml(consigneePhone)}<br>${escapeHtml(consigneeAddress)}</div></div>
              <div class="detail"><div class="label">Supplier / Order By</div><div class="value"><strong>${escapeHtml(partyName)}</strong><br>${escapeHtml(partyPhone)}</div></div>
              <div class="detail"><div class="label">Order Date</div><div class="value"><strong>${orderDate.toLocaleDateString('en-IN')}</strong><br>${orderDate.toLocaleTimeString('en-IN')}</div></div>
            </div>
            <div class="note"><strong>Notes:</strong> ${escapeHtml(order.notes || 'No notes added')}</div>
            <div class="table-wrap"><table><thead><tr><th>Sr</th><th>Product</th><th>Brand</th><th>Pack Size / Unit</th><th>Qty</th><th>Rate</th><th>MRP</th><th>GST %</th><th>GST</th><th>Amount</th></tr></thead><tbody>
              ${rows}
              <tr class="total-row"><td colspan="4" class="left">Total</td><td>${totals.totalQty}</td><td></td><td></td><td></td><td class="money">Rs.${formatMoney(financialTotals.gst)}</td><td class="money">Rs.${formatMoney(financialTotals.dealerRateSubtotal)}</td></tr>
            </tbody></table></div>
            <div class="footer"><div class="terms"><strong>Dispatch note</strong><br>Verify product, brand, pack size, quantity, MRP and batch condition at delivery. Refrigerated products must remain within their prescribed cold chain.</div><div class="totals"><div class="line"><span>Total Quantity</span><strong>${totals.totalQty}</strong></div><div class="line"><span>Taxable Amount</span><strong>Rs.${formatMoney(financialTotals.dealerRateSubtotal)}</strong></div><div class="line"><span>GST</span><strong>Rs.${formatMoney(financialTotals.gst)}</strong></div><div class="line grand"><span>Grand Total</span><span>Rs.${formatMoney(financialTotals.grandTotal)}</span></div></div></div>
          </div>
        </body>
      </html>
    `;
  }

  const { groupedItems, allSizes, totals } = groupOrderItems(order);
  const financialTotals = getOrderFinancialTotals(order, totals.totalRateAmount);
  const hasSizeSetOrder = groupedItems.some((group) => group.isSizeSetOrder);
  const sizeColumns = allSizes.map((size) => `<th>${escapeHtml(size)}</th>`).join('');
  const fixedColumnPercent = 70;
  const sizeColumnPercent = allSizes.length > 0 ? (100 - fixedColumnPercent) / allSizes.length : 0;
  const tableFontSize = allSizes.length > 5 ? 10 : 12;
  const tableCellPadding = allSizes.length > 5 ? 4 : 6;
  const tableColGroup = `
    <colgroup>
      <col style="width:3%" />
      <col style="width:9%" />
      <col style="width:14%" />
      <col style="width:5.5%" />
      <col style="width:7%" />
      <col style="width:5%" />
      ${allSizes.map(() => `<col style="width:${sizeColumnPercent}%" />`).join('')}
      <col style="width:4%" />
      <col style="width:7.5%" />
      <col style="width:7.5%" />
      <col style="width:7.5%" />
    </colgroup>
  `;
  const rows = groupedItems
    .map((group) => {
      const sizeCells = allSizes
        .map((size) => {
          const line = group.sizes.find((entry) => entry.size === size);
          if (!line) {
            return '<td class="size-cell empty"></td>';
          }
          return `
            <td class="size-cell">
              <div class="metric qty-value">${line.qty}</div>
              ${line.isSizeSet ? `<div class="metric pieces-value">${line.totalPieces} pcs</div>` : ''}
              <div class="metric rate-value">${formatMoney(line.rate)}</div>
              <div class="metric gst-value">GST ${line.gstPercentage > 0 ? `${formatMoney(line.gstPercentage)}% ` : ''}${formatMoney(line.gstAmount)}</div>
              <div class="metric mrp-value">${formatMoney(line.mrp)}</div>
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <td>${group.srNo}</td>
          <td>${escapeHtml(group.bookingType)}</td>
          <td>
            <div class="desc-name">${escapeHtml(group.description)}</div>
            ${group.color ? `<div class="desc-sub">${escapeHtml(group.color)}</div>` : ''}
          </td>
          <td>${group.setPcs || ''}</td>
          <td>${escapeHtml(group.designNo)}</td>
          <td class="metric-head">
            <div class="metric qty-label">${group.isSizeSetOrder ? 'Set Qty' : 'Qty'}</div>
            ${group.isSizeSetOrder ? '<div class="metric pieces-label">Pieces</div>' : ''}
            <div class="metric rate-label">Rate</div>
            <div class="metric gst-label">GST</div>
            <div class="metric mrp-label">MRP</div>
          </td>
          ${sizeCells}
          <td>${group.totalQty}</td>
          <td>Rs.${formatMoney(group.totalRateAmount)}</td>
          <td>Rs.${formatMoney(group.totalGstAmount)}</td>
          <td>Rs.${formatMoney(group.totalMrpAmount)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${escapeHtml(order.id)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; width: 100%; }
          body { font-family: Arial, sans-serif; color: #111827; padding: 12px; }
          .sheet { border: 2px solid #111827; padding: 12px; width: 100%; max-width: 100%; }
          .brand { text-align: center; margin-bottom: 16px; }
          .brand h1 { margin: 0; font-size: 28px; letter-spacing: 0.08em; }
          .brand p { margin: 4px 0 0; font-size: 13px; color: #475569; }
          .meta-grid { display: grid; grid-template-columns: 1.2fr 1.2fr 1fr; border: 2px solid #111827; border-bottom: 0; }
          .meta-card { min-height: 120px; border-right: 2px solid #111827; }
          .meta-card:last-child { border-right: 0; }
          .meta-title { background: #111827; color: white; padding: 8px 10px; font-weight: 700; font-size: 18px; }
          .meta-body { padding: 10px; font-size: 14px; line-height: 1.6; }
          .remark { border: 2px solid #111827; border-top: 0; padding: 10px; font-size: 14px; margin-bottom: 18px; }
          table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 18px; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          th, td {
            border: 1px solid #111827;
            padding: ${tableCellPadding}px;
            font-size: ${tableFontSize}px;
            overflow-wrap: anywhere;
            vertical-align: top;
            text-align: center;
          }
          th { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.04em; }
          .left { text-align: left; }
          .desc-name { font-weight: 700; text-align: left; }
          .desc-sub { margin-top: 4px; font-size: 11px; color: #475569; text-align: left; }
          .metric-head { min-width: 48px; }
          .metric { line-height: 1.35; }
          .qty-label, .qty-value { color: #dc2626; }
          .pieces-label, .pieces-value { color: #475569; }
          .rate-label, .rate-value { color: #16a34a; }
          .gst-label, .gst-value { color: #7c3aed; }
          .mrp-label, .mrp-value { color: #1d4ed8; }
          .size-cell { min-width: 0; }
          .empty { background: #fff; }
          .total-row td { font-weight: 700; background: #f8fafc; }
          .summary { display: grid; grid-template-columns: 1.3fr 1fr; border: 2px solid #111827; }
          .terms { padding: 12px; border-right: 2px solid #111827; min-height: 160px; }
          .totals { padding: 12px; }
          .totals p { margin: 0 0 10px; font-size: 16px; font-weight: 700; }
          .small { font-size: 12px; color: #475569; line-height: 1.5; }
          .table-wrap { width: 100%; max-width: 100%; overflow: visible; }
          @media print {
            body { padding: 0; }
            .sheet { border-width: 1px; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="brand">
            <h1>SALES ORDER</h1>
            <p>Garments Wholesale Order Summary</p>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-title">Consignee Details</div>
              <div class="meta-body">
                <div><strong>To:</strong> ${escapeHtml(consigneeName)}</div>
                <div><strong>Phone:</strong> ${escapeHtml(consigneePhone)}</div>
                <div><strong>Address:</strong> ${escapeHtml(consigneeAddress)}</div>
              </div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Party Details</div>
              <div class="meta-body">
                <div><strong>Sale By:</strong> ${escapeHtml(partyName)}</div>
                <div><strong>Phone:</strong> ${escapeHtml(partyPhone)}</div>
                <div><strong>Address:</strong> ${escapeHtml(partyAddress)}</div>
              </div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Order Details</div>
              <div class="meta-body">
                <div><strong>Order No:</strong> ${escapeHtml(String(order.id).slice(0, 8))}</div>
                <div><strong>Order Date:</strong> ${orderDate.toLocaleDateString('en-IN')}</div>
                <div><strong>Order Time:</strong> ${orderDate.toLocaleTimeString('en-IN')}</div>
              </div>
            </div>
          </div>
          <div class="remark"><strong>Remark:</strong> ${escapeHtml(order.notes || 'No notes added')}</div>

          <div class="table-wrap">
            <table>
              ${tableColGroup}
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Booking Type</th>
                  <th>Description</th>
                  <th>Set pcs</th>
                  <th>Design No</th>
                  <th>#</th>
                  ${sizeColumns}
                  <th>${hasSizeSetOrder ? 'Pieces' : 'Qty'}</th>
                  <th>Rate Total</th>
                  <th>GST Total</th>
                  <th>MRP Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="total-row">
                  <td colspan="${6 + allSizes.length}" class="left">Total</td>
                  <td>${totals.totalQty}</td>
                  <td>Rs.${formatMoney(totals.totalRateAmount)}</td>
                  <td>Rs.${formatMoney(totals.totalGstAmount)}</td>
                  <td>Rs.${formatMoney(totals.totalMrpAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="summary">
            <div class="terms">
              <div style="font-weight:700; margin-bottom:8px;">Terms & Conditions</div>
              <div class="small">
                Goods once sold are subject to dealer order approval and billing rules. Please verify sizes,
                rates, and dispatch notes before accepting delivery. Payment and transport disputes are handled
                according to the seller's booking policy.
              </div>
            </div>
            <div class="totals">
              <p>${hasSizeSetOrder ? 'Total Pieces' : 'Total Order QTY'}: ${totals.totalQty}</p>
              <p>Dealer Rate Subtotal: Rs.${formatMoney(financialTotals.dealerRateSubtotal)}</p>
              <p>GST (per item): Rs.${formatMoney(financialTotals.gst)}</p>
              <p>Grand Total: Rs.${formatMoney(financialTotals.grandTotal)}</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function shareSalesOrder(order: ShareOrder, businessTypeId?: number | string | null) {
  try {
    const canShareFiles = await Sharing.isAvailableAsync();
    if (canShareFiles) {
      const file = await Print.printToFileAsync({
        html: buildOrderShareHtml(order, businessTypeId),
        base64: false,
        width: Number(businessTypeId ?? order.business_type_id ?? order.businessTypeId) === 3 ? 595 : A4_LANDSCAPE_WIDTH,
        height: Number(businessTypeId ?? order.business_type_id ?? order.businessTypeId) === 3 ? 842 : A4_LANDSCAPE_HEIGHT,
      });
      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Share Sales Order',
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({
      title: `Sales Order #${String(order.id).slice(0, 8)}`,
      message: buildOrderShareMessage(order),
    });
  } catch (error) {
    logScreenError('shareSalesOrder', error, { orderId: order.id });
    Alert.alert('Share failed', 'Unable to open the share sheet.');
  }
}
