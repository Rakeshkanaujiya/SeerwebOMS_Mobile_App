import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { Feather } from '@expo/vector-icons';
import { apiUrl } from 'apiurl';
import { invalidateCaches } from '../src/lib/cache';
import { mapProductPayload, type CartProductDetail, type CartProductVariant } from '../src/lib/cart';
import {
  calculateGstSummary,
  fetchDealerGstSlabs,
  type GstSlab,
} from '../src/lib/gst';
import { formatCurrency } from '../src/lib/app';
import { OMS_COLORS } from '../src/lib/theme';
import type { OrderDetailItem } from './OrderDetailsContent';

export interface EditableOrder {
  id: number | string;
  dealerId: number | string;
  total: number;
  status: string;
  notes?: string;
  items: OrderDetailItem[];
  [key: string]: any;
}

interface EditableLine extends OrderDetailItem {
  clientId: string;
}

interface Props {
  order: EditableOrder;
  onCancel: () => void;
  onSaved: (order: EditableOrder) => void;
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const variantRate = (variant: CartProductVariant | undefined, product: CartProductDetail) =>
  Number(variant?.rate || variant?.mrp || product.price || 0);

const variantMrp = (variant: CartProductVariant | undefined, product: CartProductDetail) =>
  Number(variant?.mrp || product.attributes?.mrp || product.price || 0);

function snapshot(product: CartProductDetail, variant?: CartProductVariant) {
  const rate = variantRate(variant, product);
  const mrp = variantMrp(variant, product);
  return {
    ...(product.attributes ?? {}),
    brand: product.brand || product.attributes?.brand || '',
    model: product.model || product.attributes?.model || '',
    business_type_id: product.business_type_id ?? null,
    mrp,
    line_rate: rate,
    line_mrp: mrp,
    order_mode: 'piece',
    garment_meta: {
      designNumber:
        product.attributes?.design_number ??
        product.attributes?.garment_meta?.designNumber ??
        '',
      selectedColor: variant?.color || product.color || '',
      selectedPrice: rate,
      selectedMrp: mrp,
      orderMode: 'piece',
    },
  };
}

function createLine(product: CartProductDetail): EditableLine {
  const variant = product.variants?.[0];
  const rate = variantRate(variant, product);
  const mrp = variantMrp(variant, product);
  return {
    clientId: makeId(),
    productId: product.id,
    variantId: variant?.id ?? 0,
    size: variant?.size || '',
    color: variant?.color || product.color || '',
    price: rate,
    quantity: 1,
    rack: variant?.rack || '',
    attributes_snapshot: snapshot(product, variant),
    product: {
      name: product.name,
      price: product.price,
      rate,
      mrp,
    },
  };
}

export default function OrderEditorContent({ order, onCancel, onSaved }: Props) {
  const [products, setProducts] = useState<CartProductDetail[]>([]);
  const [slabs, setSlabs] = useState<GstSlab[]>([]);
  const [lines, setLines] = useState<EditableLine[]>(
    order.items.map((item) => ({ ...item, clientId: makeId() }))
  );
  const [notes, setNotes] = useState(order.notes || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const [productResponse, gstSlabs] = await Promise.all([
          fetch(`${apiUrl}/products?dealerid=${encodeURIComponent(String(order.dealerId))}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }),
          fetchDealerGstSlabs(order.dealerId, token),
        ]);
        if (!productResponse.ok) throw new Error('Products could not be loaded');
        const payload = await productResponse.json();
        const rows = Array.isArray(payload?.products) ? payload.products : payload;
        if (active) {
          setProducts((Array.isArray(rows) ? rows : []).map(mapProductPayload));
          setSlabs(gstSlabs);
        }
      } catch (error) {
        if (active) Alert.alert('Unable to edit order', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [order.dealerId]);

  const totals = useMemo(
    () =>
      calculateGstSummary(
        lines.map((line) => ({
          key: line.clientId,
          taxableValue: Number(line.price || 0) * Number(line.quantity || 0),
          slabAmount: Number(line.price || 0),
        })),
        slabs
      ),
    [lines, slabs]
  );

  const addProduct = (productId: number) => {
    const product = products.find((entry) => entry.id === productId);
    if (product) setLines((current) => [...current, createLine(product)]);
  };

  const setQuantity = (clientId: string, quantity: number) => {
    setLines((current) =>
      current.map((line) =>
        line.clientId === clientId
          ? { ...line, quantity: Math.max(1, Math.min(1000000, quantity || 1)) }
          : line
      )
    );
  };

  const setVariant = (clientId: string, variantId: number | string) => {
    setLines((current) =>
      current.map((line) => {
        if (line.clientId !== clientId) return line;
        const product = products.find((entry) => entry.id === Number(line.productId));
        const variant = product?.variants?.find((entry) => String(entry.id) === String(variantId));
        if (!product || !variant) return line;
        const rate = variantRate(variant, product);
        const mrp = variantMrp(variant, product);
        return {
          ...line,
          variantId: variant.id,
          size: variant.size || '',
          color: variant.color || '',
          price: rate,
          rack: variant.rack || '',
          attributes_snapshot: snapshot(product, variant),
          product: { name: product.name, price: product.price, rate, mrp },
        };
      })
    );
  };

  const save = async () => {
    if (lines.length === 0) {
      Alert.alert('Add a product', 'An order must contain at least one product.');
      return;
    }
    if (totals.hasMissingSlab) {
      Alert.alert('GST setup required', 'GST Master does not have an active slab for one or more item rates.');
      return;
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${apiUrl}/orders/${order.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          notes,
          items: lines.map(({ clientId: _clientId, ...line }) => line),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.messages?.error || payload?.message || 'Order update failed');
      }
      invalidateCaches('/orders');
      onSaved({ ...order, ...payload.order });
      Alert.alert('Order updated', 'Products and totals were updated successfully.');
    } catch (error) {
      Alert.alert('Unable to save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={OMS_COLORS.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Add product</Text>
      <View style={styles.pickerFrame}>
        <Picker selectedValue="" onValueChange={(value) => value && addProduct(Number(value))}>
          <Picker.Item label="Select a product" value="" />
          {products.map((product) => (
            <Picker.Item key={product.id} label={product.name} value={product.id} />
          ))}
        </Picker>
      </View>

      <ScrollView style={styles.lines} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {lines.map((line) => {
          const product = products.find((entry) => entry.id === Number(line.productId));
          const variants = product?.variants ?? [];
          return (
            <View key={line.clientId} style={styles.line}>
              <View style={styles.lineHeader}>
                <View style={styles.lineTitleArea}>
                  <Text style={styles.lineTitle} numberOfLines={2}>{line.product?.name || 'Product'}</Text>
                  <Text style={styles.lineMeta}>
                    {[line.attributes_snapshot?.brand, line.attributes_snapshot?.model]
                      .filter(Boolean)
                      .join(' / ') || 'Product details'}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Remove product"
                  onPress={() =>
                    setLines((current) => current.filter((entry) => entry.clientId !== line.clientId))
                  }
                  style={styles.iconButton}>
                  <Feather name="trash-2" size={18} color="#dc2626" />
                </Pressable>
              </View>

              {variants.length > 0 ? (
                <>
                  <Text style={styles.smallLabel}>Variant / details</Text>
                  <View style={styles.pickerFrame}>
                    <Picker
                      selectedValue={line.variantId ?? ''}
                      onValueChange={(value) => setVariant(line.clientId, value)}>
                      {variants.map((variant) => (
                        <Picker.Item
                          key={String(variant.id)}
                          label={[variant.size, variant.color].filter(Boolean).join(' / ') || `Variant ${variant.id}`}
                          value={variant.id}
                        />
                      ))}
                    </Picker>
                  </View>
                </>
              ) : null}

              <View style={styles.quantityRow}>
                <View>
                  <Text style={styles.smallLabel}>Quantity</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityLabel="Decrease quantity"
                      onPress={() => setQuantity(line.clientId, line.quantity - 1)}
                      style={styles.stepButton}>
                      <Feather name="minus" size={17} color={OMS_COLORS.text} />
                    </Pressable>
                    <TextInput
                      value={String(line.quantity)}
                      onChangeText={(value) => setQuantity(line.clientId, Number(value))}
                      keyboardType="number-pad"
                      style={styles.quantityInput}
                    />
                    <Pressable
                      accessibilityLabel="Increase quantity"
                      onPress={() => setQuantity(line.clientId, line.quantity + 1)}
                      style={styles.stepButton}>
                      <Feather name="plus" size={17} color={OMS_COLORS.text} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.amountArea}>
                  <Text style={styles.smallLabel}>Line amount</Text>
                  <Text style={styles.amount}>
                    {formatCurrency(Number(line.price || 0) * Number(line.quantity || 0))}
                  </Text>
                  <Text style={styles.unitRate}>{formatCurrency(Number(line.price || 0))} each</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Order notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional notes"
        style={styles.notes}
      />

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.taxableValue)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>GST</Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.gstAmount)}</Text>
        </View>
        <View style={[styles.totalRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Total</Text>
          <Text style={styles.grandValue}>{formatCurrency(totals.grandTotal)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onCancel} disabled={saving} style={styles.cancelButton}>
          <Feather name="x" size={17} color={OMS_COLORS.text} />
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={saving || lines.length === 0 || totals.hasMissingSlab}
          style={[
            styles.saveButton,
            (saving || lines.length === 0 || totals.hasMissingSlab) && styles.disabled,
          ]}>
          <Feather name="save" size={17} color="#ffffff" />
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save changes'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 8 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: OMS_COLORS.textMuted, fontSize: 13 },
  label: { color: OMS_COLORS.text, fontSize: 13, fontWeight: '700' },
  smallLabel: { marginBottom: 4, color: OMS_COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  pickerFrame: {
    minHeight: 46,
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: OMS_COLORS.border,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  lines: { maxHeight: 330, marginVertical: 4 },
  line: {
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: OMS_COLORS.border,
    borderRadius: 8,
    backgroundColor: OMS_COLORS.surfaceMuted,
  },
  lineHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  lineTitleArea: { flex: 1 },
  lineTitle: { color: OMS_COLORS.text, fontSize: 14, fontWeight: '800' },
  lineMeta: { marginTop: 2, color: OMS_COLORS.textMuted, fontSize: 11 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  quantityRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepper: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: OMS_COLORS.border,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  stepButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  quantityInput: {
    width: 45,
    height: 38,
    padding: 0,
    color: OMS_COLORS.text,
    textAlign: 'center',
    fontWeight: '700',
  },
  amountArea: { alignItems: 'flex-end' },
  amount: { color: OMS_COLORS.text, fontSize: 14, fontWeight: '800' },
  unitRate: { marginTop: 2, color: OMS_COLORS.textMuted, fontSize: 10 },
  notes: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: OMS_COLORS.border,
    borderRadius: 8,
    color: OMS_COLORS.text,
    backgroundColor: '#ffffff',
  },
  totals: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: OMS_COLORS.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { color: OMS_COLORS.textMuted, fontSize: 13 },
  totalValue: { color: OMS_COLORS.text, fontSize: 13, fontWeight: '700' },
  grandRow: { marginTop: 4, paddingTop: 7, borderTopWidth: 1, borderTopColor: OMS_COLORS.border },
  grandLabel: { color: OMS_COLORS.text, fontSize: 15, fontWeight: '800' },
  grandValue: { color: OMS_COLORS.primary, fontSize: 16, fontWeight: '900' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  cancelButton: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: OMS_COLORS.border,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  cancelText: { color: OMS_COLORS.text, fontWeight: '700' },
  saveButton: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: OMS_COLORS.primary,
  },
  saveText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
