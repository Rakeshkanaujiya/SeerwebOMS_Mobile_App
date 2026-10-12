import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { formatCurrency } from '../src/lib/app';
import { OMS_COLORS } from '../src/lib/theme';

interface OrderSummaryProps {
  totalItems: number;
  totalPrice: number;
  subtotal?: number;
  gst?: number;
  totalSets?: number;
  productCount?: number;
  onCheckout: () => void;
  customerName?: string | null;
  checkoutLabel?: string;
  disabled?: boolean;
  helperText?: string | null;
  showPricing?: boolean;
}

const BLUE = OMS_COLORS.primary;

export default function OrderSummary({
  totalItems,
  totalPrice,
  subtotal = totalPrice,
  gst = 0,
  totalSets = 0,
  productCount,
  onCheckout,
  customerName,
  checkoutLabel = 'Checkout',
  disabled = false,
  helperText,
  showPricing = true,
}: OrderSummaryProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Order Summary
      </Text>

      {customerName ? (
        <View style={styles.customerPill}>
          <Text style={styles.customerText} numberOfLines={1}>
            {customerName}
          </Text>
        </View>
      ) : null}

      {productCount !== undefined ? (
        <View style={styles.row}>
          <Text style={styles.label}>Products</Text>
          <Text style={styles.value}>{productCount}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.label}>Total Pieces</Text>
        <Text style={styles.value}>{totalItems}</Text>
      </View>

      {totalSets > 0 ? (
        <View style={styles.row}>
          <Text style={styles.label}>Total Sets</Text>
          <Text style={styles.value}>{totalSets}</Text>
        </View>
      ) : null}

      {showPricing ? <View style={styles.row}>
        <Text style={styles.label}>Subtotal</Text>
        <Text style={styles.value}>{formatCurrency(subtotal)}</Text>
      </View> : null}

      {showPricing && gst > 0 ? (
        <View style={styles.row}>
          <Text style={styles.label}>GST (per item)</Text>
          <Text style={styles.value}>{formatCurrency(gst)}</Text>
        </View>
      ) : null}

      {showPricing ? <View style={styles.divider} /> : null}

      {showPricing ? <View style={styles.row}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatCurrency(totalPrice)}</Text>
      </View> : null}

      {/* Checkout Button */}
      <Pressable
        style={[styles.checkoutBtn, disabled && styles.checkoutBtnDisabled]}
        onPress={onCheckout}
        disabled={disabled}
      >
        <Text style={styles.checkoutText}>
          {checkoutLabel}
        </Text>
      </Pressable>

      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    padding: 14,

    shadowColor: OMS_COLORS.primaryDeep,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  title: {
    fontSize: 16,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
    marginBottom: 12,
  },
  customerPill: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  customerText: {
    fontSize: 12,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  label: {
    fontSize: 13,
    color: OMS_COLORS.textMuted,
  },

  value: {
    fontSize: 14,
    fontWeight: '600',
    color: OMS_COLORS.primaryDeep,
  },

  divider: {
    height: 1,
    backgroundColor: OMS_COLORS.primaryBorder,
    marginVertical: 12,
  },

  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },

  totalValue: {
    fontSize: 17,
    fontWeight: '700',
    color: BLUE,
  },

  checkoutBtn: {
    marginTop: 14,
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  checkoutBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },

  checkoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  helperText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    color: OMS_COLORS.primaryDeep,
  },
});
