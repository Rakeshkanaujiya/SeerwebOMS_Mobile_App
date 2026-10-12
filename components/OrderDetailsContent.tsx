import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatCurrency } from '../src/lib/app';
import { OMS_COLORS } from '../src/lib/theme';

export interface OrderDetailItem {
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
  attributes_snapshot?: Record<string, any> | null;
  product: {
    name: string;
    price?: number;
    mrp?: number | null;
    rate?: number | null;
  };
}

interface OrderDetailsContentProps {
  items: OrderDetailItem[];
  total: number;
  notes?: string | null;
}

function getSnapshotValue(snapshot: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = snapshot[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }
  return '';
}

export default function OrderDetailsContent({
  items,
  total,
  notes,
}: OrderDetailsContentProps) {
  const subtotal = items.reduce((sum, item) => {
    const snapshot = item.attributes_snapshot ?? {};
    const savedTaxableValue = Number(item.taxableValue ?? snapshot.taxable_value ?? 0);
    if (savedTaxableValue > 0) return sum + savedTaxableValue;

    const rate = Number(item.price ?? item.product?.rate ?? item.product?.price ?? 0);
    return sum + rate * Number(item.quantity || 0);
  }, 0);
  const savedGst = items.reduce((sum, item) => {
    const snapshot = item.attributes_snapshot ?? {};
    return sum + Number(item.gstAmount ?? snapshot.gst_amount ?? 0);
  }, 0);
  const gst = savedGst > 0 ? savedGst : Math.max(0, Number(total || 0) - subtotal);

  return (
    <View style={styles.container}>
      {items.map((item, index) => {
        const snapshot = item.attributes_snapshot ?? {};
        const garmentMeta = snapshot.garment_meta ?? {};
        const rate = Number(item.price ?? item.product?.rate ?? item.product?.price ?? 0);
        const mrp = Number(item.product?.mrp ?? snapshot.mrp ?? 0);
        const fallbackLineAmount = rate * Number(item.quantity || 0);
        const lineAmount = Number(item.taxableValue ?? snapshot.taxable_value ?? fallbackLineAmount);
        const lineGstPercentage = Number(item.gstPercentage ?? snapshot.gst_percentage ?? 0);
        const lineGstAmount = Number(item.gstAmount ?? snapshot.gst_amount ?? 0);
        const designNumber =
          getSnapshotValue(snapshot, ['design_number', 'design']) ||
          String(garmentMeta.designNumber ?? garmentMeta.design_number ?? '');
        const bookingType =
          getSnapshotValue(snapshot, ['booking_type']) ||
          String(garmentMeta.bookingType ?? garmentMeta.booking_type ?? '');
        const brand = getSnapshotValue(snapshot, ['brand', 'Brand']);
        const model = getSnapshotValue(snapshot, ['model', 'Model']);

        return (
          <View key={`${item.productId ?? index}-${item.variantId ?? index}-${index}`} style={styles.item}>
            <View style={styles.itemHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.product?.name || 'Product'}</Text>
                {[brand, model].filter(Boolean).length > 0 ? (
                  <Text style={styles.meta}>{[brand, model].filter(Boolean).join(' • ')}</Text>
                ) : null}
              </View>
              <Text style={styles.amount}>{formatCurrency(lineAmount)}</Text>
            </View>

            <View style={styles.chips}>
              {item.size ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Size {item.size}</Text>
                </View>
              ) : null}
              {item.color ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{item.color}</Text>
                </View>
              ) : null}
              {designNumber ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Design {designNumber}</Text>
                </View>
              ) : null}
              {bookingType ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{bookingType}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.pricingRow}>
              <Text style={styles.pricingText}>
                {item.quantity} × {formatCurrency(rate)}
              </Text>
              
            </View>
            {lineGstAmount > 0 ? (
              <Text style={styles.gstText}>
                GST {lineGstPercentage > 0 ? `${lineGstPercentage}% ` : ''}
                {formatCurrency(lineGstAmount)}
              </Text>
            ) : null}
          </View>
        );
      })}

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
        </View>
        {gst > 0.01 ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST</Text>
            <Text style={styles.totalValue}>{formatCurrency(gst)}</Text>
          </View>
        ) : null}
        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>{formatCurrency(Number(total || 0))}</Text>
        </View>
      </View>

      {notes ? (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  item: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OMS_COLORS.border,
    backgroundColor: OMS_COLORS.surfaceMuted,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: OMS_COLORS.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 11,
    color: OMS_COLORS.textMuted,
  },
  amount: {
    fontSize: 14,
    fontWeight: '800',
    color: OMS_COLORS.primaryDeep,
  },
  chips: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },
  pricingRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricingText: {
    fontSize: 12,
    color: OMS_COLORS.textMuted,
  },
  mrpText: {
    fontSize: 10,
    color: OMS_COLORS.textSubtle,
    textDecorationLine: 'line-through',
  },
  gstText: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },
  totals: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: OMS_COLORS.border,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  totalLabel: {
    fontSize: 13,
    color: OMS_COLORS.textMuted,
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '700',
    color: OMS_COLORS.text,
  },
  grandTotal: {
    marginTop: 2,
    marginBottom: 0,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: OMS_COLORS.border,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: OMS_COLORS.text,
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: OMS_COLORS.primary,
  },
  notes: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: OMS_COLORS.primaryDeep,
  },
  notesText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: OMS_COLORS.text,
  },
});
