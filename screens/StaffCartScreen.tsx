import { useCartPricing } from '../src/lib/useCartPricing';
import { useFocusEffect } from '@react-navigation/native';
import { resolveCartDisplaySettings, useDealerDisplaySettings } from '../src/lib/cartSettings';
import { useWindowDimensions } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiUrl } from 'apiurl';
import BottomTabNavigator from 'components/BottomTabNavigator';
import CartLineItem from 'components/CartLineItem';
import GarmentCartGroupCard from 'components/GarmentCartGroupCard';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import Navbar from 'components/Navbar';
import OrderSummary from 'components/OrderSummary';
import { useCart } from '../context/CartContext';
import type { RootStackParamList } from '../types/navigation';
import {
  buildCartDisplayItems,
  buildCartRows,
  createCartSnapshotItem,
  type CartDisplayItem,
} from '../src/lib/cart';
import { buildOrderItems, getOrderTotals } from '../src/lib/order';
import { invalidateCaches } from '../src/lib/cache';
import { fetchDealerGstSlabs, type GstSlab } from '../src/lib/gst';
import { OMS_COLORS } from '../src/lib/theme';
import { getCustomerDealerId } from '../src/lib/customers';
import { invalidatePartyProductHistory } from '../src/lib/partyProductHistory';
import { logScreenError } from '../src/lib/logging';

interface Retailer {
  id: number;
  name: string;
  ledger: string;
  phone: string;
  address: string;
  city: string;
}

const BLUE = OMS_COLORS.primary;
const RED = '#DC2626';

export default function StaffCartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { cart, editingOrder, addToCart, updateCartQuantity, removeFromCart, clearCart } = useCart();
  const [gstSlabs, setGstSlabs] = useState<GstSlab[]>([]);
  const [gstSlabsLoading, setGstSlabsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const display = useDealerDisplaySettings(getCustomerDealerId(user), user?.business_type_id);
  const cardSettings = resolveCartDisplaySettings(
    display.cart,
    display.list,
    display.schemaFields,
    user?.business_type_id,
    display.fieldSettings,
    display.sectionSettings
  );
  const gstDealerId = Number(getCustomerDealerId(user));
  const pricingVisible = cardSettings.visibleDetails.price;
  const productNameVisible = cardSettings.visibleDetails.productName;
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(display.cart.cardsPerRow, Math.floor((width - 24) / 280)));
  const [selectedRetailer, setSelectedRetailer] = useState<Retailer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [removeModalVisible, setRemoveModalVisible] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{
    productId: number;
    variantIds: Array<number | string>;
    name: string;
    color?: string;
  } | null>(null);
  const [notes, setNotes] = useState('');

  const pricing = useCartPricing(Number(getCustomerDealerId(user)), Number(selectedRetailer?.id ?? 0));
  const productsById = pricing.products;

  const fetchGstSlabs = useCallback(async (dealerId: number) => {
    setGstSlabsLoading(true);
    try {
      const token = (await AsyncStorage.getItem('token')) ?? undefined;
      const slabs = await fetchDealerGstSlabs(dealerId, token);
      setGstSlabs(slabs);
    } catch (error) {
      console.error('Failed to fetch GST slabs:', error);
      setGstSlabs([]);
    } finally {
      setGstSlabsLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const [userData, retailerData] = await Promise.all([
          AsyncStorage.getItem('user'),
          AsyncStorage.getItem('selectedRetailer'),
        ]);

        if (!userData) return;

        const parsedUser = JSON.parse(userData);
        const dealerId = getCustomerDealerId(parsedUser);
        setUser(parsedUser);
        if (!dealerId) {
          navigation.navigate('Login' as never);
          return;
        }

        if (retailerData) setSelectedRetailer(JSON.parse(retailerData));

      } catch (error) {
        console.error('StaffCartScreen boot error:', error);
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void AsyncStorage.getItem('selectedRetailer').then(raw => {
      if (active) setSelectedRetailer(raw ? JSON.parse(raw) : null);
    });
    return () => { active = false; };
  }, []));

  useEffect(() => {
    if (editingOrder?.notes !== undefined) {
      setNotes(editingOrder.notes || '');
    }
  }, [editingOrder]);

  useEffect(() => {
    if (gstDealerId) void fetchGstSlabs(gstDealerId);
  }, [gstDealerId, fetchGstSlabs]);

  const cartRows = useMemo(() => buildCartRows(cart, productsById), [cart, productsById]);
  const cartDisplayItems = useMemo(
    () => buildCartDisplayItems(cartRows, productsById),
    [cartRows, productsById]
  );
  const totals = useMemo(
    () => getOrderTotals(cart, user?.business_type_id, gstSlabs),
    [cart, gstSlabs, user?.business_type_id]
  );
  const totalItems = totals.totalItems;
  const totalPrice = totals.total;
  const isCartEmpty = cartDisplayItems.length === 0;
  const checkoutBlockedByGst = !isCartEmpty && (pricing.loading || Boolean(pricing.error) || gstSlabsLoading || totals.hasMissingGstSlab);
  const gstHelperText = pricing.error || (pricing.loading ? 'Refreshing customer prices...' : null) || (gstSlabsLoading
    ? 'Loading GST Master slabs...'
    : totals.hasMissingGstSlab
      ? 'GST Master does not have an active slab for one or more item rates.'
      : null);

  const handleIncrement = useCallback(
    (productId: number, variantId: number | string, currentQty: number, color?: string) => {
      if (currentQty <= 0) {
        const product = productsById[productId];
        const variant = product?.variants?.find((entry) => String(entry.id) === String(variantId));
        if (!variant) return;

        addToCart(createCartSnapshotItem(product, 1, variant, { color }));
        return;
      }

      updateCartQuantity(productId, variantId, currentQty + 1, color);
    },
    [addToCart, productsById, updateCartQuantity]
  );

  const handleDecrement = useCallback(
    (productId: number, variantId: number | string, currentQty: number, color?: string) => {
      if (currentQty <= 1) removeFromCart(productId, variantId, color);
      else updateCartQuantity(productId, variantId, currentQty - 1, color);
    },
    [removeFromCart, updateCartQuantity]
  );

  const handleSubmitOrder = async () => {
    if (!user || cart.length === 0) return;

    if (!selectedRetailer) return;
    const dealerId = getCustomerDealerId(user);
    if (!dealerId) return;
    if (checkoutBlockedByGst) {
      Alert.alert('GST Master', gstHelperText || 'GST Master slabs are not ready yet.');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await AsyncStorage.getItem('token');
      const orderItems = buildOrderItems(cart, productsById, totals.taxLines);

      const orderPayload = {
        retailerId: selectedRetailer.id,
        retailerName: selectedRetailer.name,
        dealerId,
        total: totals.total,
        taxableValue: totals.taxableValue,
        gstPercentage: totals.gstPercentage,
        gstAmount: totals.gst,
        notes,
        order_by: user.role,
        order_by_id: user.id,
        items: orderItems,
      };

      const isEditing = Boolean(editingOrder?.orderId);
      const response = await fetch(isEditing ? `${apiUrl}/orders/${editingOrder?.orderId}` : `${apiUrl}/orders`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('Order failed:', response.status, body);
        let message = isEditing ? 'Failed to update order' : 'Failed to submit order';
        try {
          const payload = body ? JSON.parse(body) : {};
          message = payload?.messages?.error || payload?.message || payload?.error || message;
        } catch {
          if (body.trim()) message = body.trim();
        }
        throw new Error(message);
      }

      await invalidatePartyProductHistory(dealerId, selectedRetailer.id);
      invalidateCaches('/orders');
      clearCart();
      await AsyncStorage.removeItem('selectedRetailer');
      setSelectedRetailer(null);
      setConfirmModalVisible(false);
      setNotes('');
      navigation.replace('StaffOrderScreen');
    } catch (error) {
      logScreenError('StaffCartScreen.submitOrder', error, {
        dealerId,
        retailerId: selectedRetailer.id,
      });
      Alert.alert(
        editingOrder ? 'Order update failed' : 'Order failed',
        error instanceof Error ? error.message : 'Unable to save the order. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Navbar user={user?.name} />

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        extraScrollHeight={36}>
        <Text style={styles.pageTitle}>Your Cart</Text>
        <Text style={styles.pageSubtitle}>Review the customer order before submitting it.</Text>

        {selectedRetailer ? (
          <View style={styles.retailerBanner}>
            <View style={styles.retailerIconWrap}>
              <Feather name="user" size={15} color={BLUE} />
            </View>
            <Text style={styles.retailerName} numberOfLines={1}>
              {selectedRetailer.ledger}
            </Text>
            <View style={styles.retailerBadge}>
              <Text style={styles.retailerBadgeText}>Customer</Text>
            </View>
          </View>
        ) : (
          <View style={styles.warningBanner}>
            <Feather name="info" size={16} color={OMS_COLORS.primary} />
            <Text style={styles.warningText}>Select a customer before submitting the order.</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={BLUE} style={styles.loader} />
        ) : isCartEmpty ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="shopping-cart" size={36} color="#D1D5DB" />
            </View>
            <Text style={styles.emptyTitle}>Cart is empty</Text>
            <Text style={styles.emptySubtitle}>
              Go to the customer products tab and add items to continue.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.countStrip}>
              <Text style={styles.countText}>
                {totalItems} item{totalItems !== 1 ? 's' : ''} in cart
              </Text>
              {pricingVisible ? <Text style={styles.countPrice}>
                ₹{totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text> : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cartDisplayItems.map((item: CartDisplayItem) => <View key={item.key} style={{ width: `${100 / columns}%`, paddingHorizontal: 4 }}>
              {item.kind === 'garment-group' ? (
                <GarmentCartGroupCard settings={cardSettings}
                  key={item.key}
                  group={item}
                  onDecrementSize={(variantId, currentQty) =>
                    handleDecrement(
                      item.productId,
                      variantId,
                      currentQty,
                      item.colorLabel ?? undefined
                    )
                  }
                  onIncrementSize={(variantId, currentQty) =>
                    handleIncrement(
                      item.productId,
                      variantId,
                      currentQty,
                      item.colorLabel ?? undefined
                    )
                  }
                  onRemoveSize={(variantId) => {
                    const sizeItem = item.sizes.find((entry) => entry.variantId === variantId);
                    setPendingRemove({
                      productId: item.productId,
                      variantIds: [variantId],
                      name: `${item.name}${sizeItem ? ` (${sizeItem.sizeLabel})` : ''}`,
                      color: item.colorLabel ?? undefined,
                    });
                    setRemoveModalVisible(true);
                  }}
                  onRemoveProduct={() => {
                    setPendingRemove({
                      productId: item.productId,
                      variantIds: item.sizes.map((size) => size.variantId),
                      name: item.name,
                      color: item.colorLabel ?? undefined,
                    });
                    setRemoveModalVisible(true);
                  }}
                />
              ) : (
                <CartLineItem settings={cardSettings}
                  onQuantityChange={quantity => updateCartQuantity(item.productId, item.variantId, quantity, item.colorLabel ?? undefined)}
                  key={item.key}
                  row={item}
                  onDecrement={() =>
                    handleDecrement(
                      item.productId,
                      item.variantId,
                      item.quantity,
                      item.colorLabel ?? undefined
                    )
                  }
                  onIncrement={() =>
                    handleIncrement(
                      item.productId,
                      item.variantId,
                      item.quantity,
                      item.colorLabel ?? undefined
                    )
                  }
                  onRemove={() => {
                    setPendingRemove({
                      productId: item.productId,
                      variantIds: [item.variantId],
                      name: item.name,
                      color: item.colorLabel ?? undefined,
                    });
                    setRemoveModalVisible(true);
                  }}
                />
              )}
            </View>)}
            </View>

            <OrderSummary
              totalItems={totalItems}
              totalPrice={totalPrice}
              subtotal={totals.subtotal}
              gst={totals.gst}
              totalSets={totals.totalSets}
              productCount={totals.productCount}
              showPricing={pricingVisible}
              customerName={selectedRetailer?.ledger || selectedRetailer?.name}
              checkoutLabel={selectedRetailer ? 'Checkout' : 'Select Customer First'}
              disabled={!selectedRetailer || checkoutBlockedByGst}
              helperText={!selectedRetailer ? 'Select a customer to proceed' : gstHelperText}
              onCheckout={() => {
                if (checkoutBlockedByGst) {
                  Alert.alert('GST Master', gstHelperText || 'GST Master slabs are not ready yet.');
                  return;
                }
                setConfirmModalVisible(true);
              }}
            />
          </>
        )}
      </KeyboardAwareScrollView>

      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <KeyboardAwareScrollView contentContainerStyle={styles.modalOverlay} extraScrollHeight={36}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Feather name="shopping-bag" size={24} color={BLUE} />
            </View>
            <Text style={styles.modalTitle}>Confirm Order</Text>
            <Text style={styles.modalSubtitle}>
              {totalItems} item{totalItems !== 1 ? 's' : ''}{pricingVisible ? ` · ₹${totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : ''}
            </Text>
            {selectedRetailer ? (
              <Text style={styles.modalRetailer}>For: {selectedRetailer.ledger}</Text>
            ) : null}

            <View style={styles.modalList}>
              {cartDisplayItems.map((item) => (
                <View key={item.key} style={styles.modalListRow}>
                  <Text style={styles.modalListLabel} numberOfLines={1}>
                    {productNameVisible ? item.name : 'Product'}
                    {'quantity' in item ? ` ×${item.quantity}` : ` ×${item.totalQuantity}`}
                  </Text>
                  {pricingVisible ? <Text style={styles.modalListValue}>
                    ₹{item.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text> : null}
                </View>
              ))}
            </View>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any special instructions..."
              placeholderTextColor="#9CA3AF"
              multiline
              style={styles.notesInput}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setConfirmModalVisible(false)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmitOrder}
                disabled={isSubmitting || checkoutBlockedByGst}
                style={[
                  styles.primaryBtn,
                  (isSubmitting || checkoutBlockedByGst) && styles.primaryBtnDisabled,
                ]}>
                <Text style={styles.primaryBtnText}>
                  {isSubmitting ? 'Submitting...' : editingOrder ? 'Update Order' : 'Submit Order'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      <Modal visible={removeModalVisible} transparent animationType="fade">
        <KeyboardAwareScrollView contentContainerStyle={styles.modalOverlay} extraScrollHeight={36}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, styles.modalIconRed]}>
              <Feather name="trash-2" size={24} color={RED} />
            </View>
            <Text style={styles.modalTitle}>Remove Item?</Text>
            <Text style={styles.modalSubtitle}>{productNameVisible ? pendingRemove?.name : 'Selected item'}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setRemoveModalVisible(false);
                  setPendingRemove(null);
                }}
                style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  pendingRemove?.variantIds.forEach((variantId) =>
                    removeFromCart(
                      pendingRemove.productId,
                      variantId,
                      pendingRemove.color
                    )
                  );
                  setRemoveModalVisible(false);
                  setPendingRemove(null);
                }}
                style={[styles.primaryBtn, styles.removeBtn]}>
                <Text style={styles.primaryBtnText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      <BottomTabNavigator />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pageSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
  },
  retailerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    padding: 10,
    gap: 8,
    marginBottom: 14,
  },
  retailerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: OMS_COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retailerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },
  retailerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },
  retailerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OMS_COLORS.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    padding: 10,
    marginBottom: 14,
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: OMS_COLORS.primaryDeep,
  },
  loader: {
    marginTop: 60,
  },
  countStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  countPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
  },
  modalIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    marginBottom: 14,
  },
  modalIconRed: {
    backgroundColor: '#FEF2F2',
  },
  modalTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
  },
  modalRetailer: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: BLUE,
  },
  modalList: {
    width: '100%',
    marginTop: 16,
    maxHeight: 180,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  modalListLabel: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
  },
  modalListValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  notesInput: {
    width: '100%',
    marginTop: 14,
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: BLUE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  removeBtn: {
    backgroundColor: RED,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
