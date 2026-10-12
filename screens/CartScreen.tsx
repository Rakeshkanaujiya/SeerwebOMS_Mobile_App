import { useCartPricing } from '../src/lib/useCartPricing';
import { useWindowDimensions } from 'react-native';
import { resolveCartDisplaySettings, useDealerDisplaySettings } from '../src/lib/cartSettings';
import { getCustomerDealerId } from '../src/lib/customers';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PinchGestureHandler } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiUrl } from 'apiurl';
import BottomTabNavigator from 'components/BottomTabNavigator';
import CartLineItem from 'components/CartLineItem';
import CustomAlert from 'components/CustomAlert';
import GarmentCartGroupCard from 'components/GarmentCartGroupCard';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import Navbar from 'components/Navbar';
import OrderSummary from 'components/OrderSummary';
import { useCart } from '../context/CartContext';
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

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const BLUE = OMS_COLORS.primary;

export default function CartScreen() {
  const { cart, editingOrder, addToCart, updateCartQuantity, removeFromCart, clearCart } = useCart();
  const [gstSlabs, setGstSlabs] = useState<GstSlab[]>([]);
  const [gstSlabsLoading, setGstSlabsLoading] = useState(false);
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
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [removeModal, setRemoveModal] = useState(false);
  const [removeItem, setRemoveItem] = useState<{
    productId: number;
    variantIds: Array<number | string>;
    name: string;
    color?: string;
  } | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [notes, setNotes] = useState('');
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const scaleValue = useState(new Animated.Value(1))[0];

  const showAlert = useCallback((message: string) => {
    setAlertMsg(message);
    setAlertVisible(true);
  }, []);

  const pricing = useCartPricing(Number(getCustomerDealerId(user)), Number(user?.id ?? 0));
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
        const userStr = await AsyncStorage.getItem('user');
        if (!userStr) return;
        const parsedUser = JSON.parse(userStr);
        setUser(parsedUser);

      } catch (error) {
        console.error('CartScreen boot error:', error);
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

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

  const increment = useCallback(
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

  const decrement = useCallback(
    (productId: number, variantId: number | string, currentQty: number, color?: string) => {
      if (currentQty <= 1) removeFromCart(productId, variantId, color);
      else updateCartQuantity(productId, variantId, currentQty - 1, color);
    },
    [removeFromCart, updateCartQuantity]
  );

  const submitOrder = async () => {
    if (!user || totalItems === 0) return;
    if (checkoutBlockedByGst) {
      showAlert(gstHelperText || 'GST Master slabs are not ready yet.');
      return;
    }
    setIsSubmitting(true);

    try {
      const token = await AsyncStorage.getItem('token');
      const orderItems = buildOrderItems(cart, productsById, totals.taxLines);

      const payload = {
        retailerId: user.id,
        retailerName: user.name,
        dealerId: user.dealer_id,
        total: totals.total,
        taxableValue: totals.taxableValue,
        gstPercentage: totals.gstPercentage,
        gstAmount: totals.gst,
        notes,
        order_by: user?.role,
        order_by_id: user?.id,
        items: orderItems,
      };

      const isEditing = Boolean(editingOrder?.orderId);
      const response = await fetch(isEditing ? `${apiUrl}/orders/${editingOrder?.orderId}` : `${apiUrl}/orders`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body?.messages?.error ||
            body?.message ||
            (isEditing ? 'Order update failed' : 'Order failed')
        );
      }

      invalidateCaches('/orders');
      clearCart();
      setConfirmModal(false);
      setNotes('');
      showAlert(isEditing ? `Order #${editingOrder?.orderId} updated successfully!` : 'Order placed successfully!');
    } catch (error) {
      console.error('Order submission error:', error);
      showAlert(error instanceof Error ? error.message : 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Navbar user={user?.name} />

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
        extraScrollHeight={36}>
        <Text style={styles.pageTitle}>Your Cart</Text>
        <Text style={styles.pageSubtitle}>Review your items and confirm the order.</Text>

        {loading && isCartEmpty ? (
          <ActivityIndicator size="large" color={BLUE} style={styles.loader} />
        ) : isCartEmpty ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="shopping-cart" size={36} color="#D1D5DB" />
            </View>
            <Text style={styles.emptyTitle}>Cart is empty</Text>
            <Text style={styles.emptySubtitle}>
              Add products from the catalog to place an order.
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
                  onImagePress={(imageUri) => {
                    setSelectedImageUri(imageUri);
                    setImageModalVisible(true);
                    scaleValue.setValue(1);
                  }}
                  onDecrementSize={(variantId, currentQty) =>
                    decrement(item.productId, variantId, currentQty, item.colorLabel ?? undefined)
                  }
                  onIncrementSize={(variantId, currentQty) =>
                    increment(item.productId, variantId, currentQty, item.colorLabel ?? undefined)
                  }
                  onRemoveSize={(variantId) => {
                    const sizeItem = item.sizes.find((entry) => entry.variantId === variantId);
                    setRemoveItem({
                      productId: item.productId,
                      variantIds: [variantId],
                      name: `${item.name}${sizeItem ? ` (${sizeItem.sizeLabel})` : ''}`,
                      color: item.colorLabel ?? undefined,
                    });
                    setRemoveModal(true);
                  }}
                  onRemoveProduct={() => {
                    setRemoveItem({
                      productId: item.productId,
                      variantIds: item.sizes.map((size) => size.variantId),
                      name: item.name,
                      color: item.colorLabel ?? undefined,
                    });
                    setRemoveModal(true);
                  }}
                />
              ) : (
                <CartLineItem settings={cardSettings}
                  onQuantityChange={quantity => updateCartQuantity(item.productId, item.variantId, quantity, item.colorLabel ?? undefined)}
                  key={item.key}
                  row={item}
                  onImagePress={(imageUri) => {
                    setSelectedImageUri(imageUri);
                    setImageModalVisible(true);
                    scaleValue.setValue(1);
                  }}
                  onDecrement={() =>
                    decrement(
                      item.productId,
                      item.variantId,
                      item.quantity,
                      item.colorLabel ?? undefined
                    )
                  }
                  onIncrement={() =>
                    increment(
                      item.productId,
                      item.variantId,
                      item.quantity,
                      item.colorLabel ?? undefined
                    )
                  }
                  onRemove={() => {
                    setRemoveItem({
                      productId: item.productId,
                      variantIds: [item.variantId],
                      name: item.name,
                      color: item.colorLabel ?? undefined,
                    });
                    setRemoveModal(true);
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
              onCheckout={() => {
                if (checkoutBlockedByGst) {
                  showAlert(gstHelperText || 'GST Master slabs are not ready yet.');
                  return;
                }
                setConfirmModal(true);
              }}
              disabled={checkoutBlockedByGst}
              helperText={gstHelperText}
            />
          </>
        )}
      </KeyboardAwareScrollView>

      <Modal transparent visible={confirmModal} animationType="fade">
        <KeyboardAwareScrollView contentContainerStyle={styles.modalOverlay} extraScrollHeight={36}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Order</Text>
            <Text style={styles.modalSubtitle}>
              {totalItems} item{totalItems !== 1 ? 's' : ''}{pricingVisible ? ` · ₹${totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : ''}
            </Text>

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
              <Pressable onPress={() => setConfirmModal(false)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitOrder}
                disabled={isSubmitting || checkoutBlockedByGst}
                style={[styles.primaryBtn, (isSubmitting || checkoutBlockedByGst) && styles.primaryBtnDisabled]}>
                <Text style={styles.primaryBtnText}>
                  {isSubmitting ? 'Submitting...' : editingOrder ? 'Update Order' : 'Submit Order'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      <Modal transparent visible={removeModal} animationType="fade">
        <KeyboardAwareScrollView contentContainerStyle={styles.modalOverlay} extraScrollHeight={36}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove item?</Text>
            <Text style={styles.modalSubtitle}>{productNameVisible ? removeItem?.name : 'Selected item'}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setRemoveModal(false);
                  setRemoveItem(null);
                }}
                style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  removeItem?.variantIds.forEach((variantId) =>
                    removeFromCart(removeItem.productId, variantId, removeItem.color)
                  );
                  setRemoveModal(false);
                  setRemoveItem(null);
                }}
                style={[styles.primaryBtn, styles.removeBtn]}>
                <Text style={styles.primaryBtnText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      <Modal
        visible={imageModalVisible && cardSettings.visibleDetails.image}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setImageModalVisible(false);
          setSelectedImageUri(null);
        }}>
        <View style={styles.imageModal}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setImageModalVisible(false);
              setSelectedImageUri(null);
            }}
          />
          <PinchGestureHandler
            onGestureEvent={Animated.event([{ nativeEvent: { scale: scaleValue } }], {
              useNativeDriver: true,
            })}>
            <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
              <Image
                source={{ uri: selectedImageUri || '' }}
                resizeMode="contain"
                style={{ width: screenWidth * 0.9, height: screenHeight * 0.7 }}
              />
            </Animated.View>
          </PinchGestureHandler>
        </View>
      </Modal>

      <CustomAlert
        visible={alertVisible}
        message={alertMsg}
        onClose={() => setAlertVisible(false)}
      />
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
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 18,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
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
  modalList: {
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
    backgroundColor: '#DC2626',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  imageModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
