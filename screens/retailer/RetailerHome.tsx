import { CartSettings, DealerProductSchemaField, resolveCartDisplaySettings, useDealerDisplaySettings } from '../../src/lib/cartSettings';
import { useServerPage, useDebouncedValue } from '../../src/lib/useServerPage';
import PageControls from '../../components/PageControls';
import { useWindowDimensions } from 'react-native';
import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomAlert from 'components/CustomAlert';
import BottomTabNavigator from 'components/BottomTabNavigator';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { apiUrl } from 'apiurl';
import RefreshWrapper from 'components/RefreshWrapper';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import Navbar from 'components/Navbar';
import ProductCart, {
  Product,
  ProductVariant,
  CartItem,
  AddVariantOptions,
} from 'components/ProductCart';
import { useCart } from '../../context/CartContext';
import { createCartSnapshotItem, getCartLinePieceQuantity } from '../../src/lib/cart';
import { OMS_COLORS } from '../../src/lib/theme';
import {
  DEFAULT_PRODUCT_LIST_SETTINGS,
  loadProductListSettings,
  ProductListSettings,
} from '../../src/lib/dealerSettings';

// NOTE: @react-native-voice/voice removed — requires custom native build, not supported in Expo Go.

interface RenderItemProps {
  item: Product;
  businessTypeId?: number | null;
  cart: CartItem[];
  onAddVariant: (
    product: Product,
    variant: ProductVariant,
    qty: number,
    options?: AddVariantOptions
  ) => void;
  onUpdateVariantQty: (
    productId: number,
    variantId: number | string,
    qty: number,
    color?: string
  ) => void;
  onRemoveVariant: (productId: number, variantId: number | string, color?: string) => void;
  onAddSimple: (product: Product, quantity?: number) => void;
  onUpdateSimpleQty: (productId: number, qty: number) => void;
  onRemoveSimple: (productId: number) => void;
  onOpenDetails: (product: Product) => void;
  productListSettings: ProductListSettings;
  productFieldSettings: ReturnType<typeof useDealerDisplaySettings>['fieldSettings'];
  productSectionSettings: ReturnType<typeof useDealerDisplaySettings>['sectionSettings'];
  cartSettings: CartSettings;
  schemaFields: DealerProductSchemaField[] | null;
}

const MemoProductCard = memo(
  ({
    item,
    businessTypeId,
    cart,
    onAddVariant,
    onUpdateVariantQty,
    onRemoveVariant,
    onAddSimple,
    onUpdateSimpleQty,
    onRemoveSimple,
    onOpenDetails,
    productListSettings,
    productFieldSettings,
    productSectionSettings,
    cartSettings,
    schemaFields,
  }: RenderItemProps) => {
    const effectiveBusinessTypeId =
      businessTypeId ?? item.business_type_id ?? null;
    const normalizedProduct = {
      ...item,
      business_type_id: effectiveBusinessTypeId,
    };

    return (
      <View style={{ flex: 1, marginHorizontal: 4 }}><ProductCart
        product={normalizedProduct}
        showSize={Number(effectiveBusinessTypeId) === 2}
        onOpenDetails={onOpenDetails}
        cart={cart}
        onAddVariant={onAddVariant}
        onUpdateVariantQty={onUpdateVariantQty}
        onRemoveVariant={onRemoveVariant}
        onAddSimple={onAddSimple}
        onUpdateSimpleQty={onUpdateSimpleQty}
        onRemoveSimple={onRemoveSimple}
        cartSettings={cartSettings}
        productListSettings={productListSettings}
        productFieldSettings={productFieldSettings}
        productSectionSettings={productSectionSettings}
        schemaFields={schemaFields}
      /></View>
    );
  }
);
MemoProductCard.displayName = 'MemoProductCard';

export default function RetailerHome() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [search, setSearch] = useState('');
  const { cart, addToCart, updateCartQuantity, removeFromCart } = useCart();
  const [user, setUser] = useState<any>(null);
  const query = useDebouncedValue(search);
  const page = useServerPage<Product>(user?.dealer_id ? `/products?dealerid=${user.dealer_id}&create_order=1&search=${encodeURIComponent(query)}` : null, 'products');
  const filteredProducts = page.rows.map(item => ({ ...item, id: Number(item.id), price: Number(item.effective_rate ?? item.price), effective_rate: item.effective_rate == null ? undefined : Number(item.effective_rate), party_rate: item.party_rate == null ? undefined : Number(item.party_rate), dealerid: Number(item.dealerid), stock: Number(item.stock) }));
  const loading = page.loading;
  const display = useDealerDisplaySettings(user?.dealer_id, user?.business_type_id);
  const cartSettings = display.cart;
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(cartSettings.cardsPerRow, Math.floor((width - 24) / 280)));
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);
  const productListSettings = display.list;

  const showAlert = useCallback((msg: string) => {
    setAlertMsg(msg);
    setAlertVisible(true);
  }, []);

  const handleAddVariant = useCallback(
    (
      product: Product,
      variant: ProductVariant,
      qty: number,
      options?: AddVariantOptions
    ) => {
      addToCart(createCartSnapshotItem(product, qty, variant, options));
      showAlert('Added to cart');
    },
    [addToCart, showAlert]
  );

  const handleUpdateVariantQty = useCallback(
    (productId: number, variantId: number | string, qty: number, color?: string) => {
      if (qty <= 0) {
        removeFromCart(productId, variantId, color);
      } else {
        updateCartQuantity(productId, variantId, Math.min(qty, 999), color);
      }
    },
    [removeFromCart, updateCartQuantity]
  );

  const handleRemoveVariant = useCallback(
    (productId: number, variantId: number | string, color?: string) => {
      removeFromCart(productId, variantId, color);
    },
    [removeFromCart]
  );

  const handleAddSimple = useCallback(
    (product: Product, quantity = 1) => {
      addToCart(createCartSnapshotItem(product, quantity));
      showAlert('Added to cart');
    },
    [addToCart, showAlert]
  );

  const handleUpdateSimpleQty = useCallback(
    (productId: number, qty: number) => {
      if (qty <= 0) {
        removeFromCart(productId, 0);
      } else {
        updateCartQuantity(productId, 0, Math.min(qty, 999));
      }
    },
    [removeFromCart, updateCartQuantity]
  );

  const handleRemoveSimple = useCallback(
    (productId: number) => {
      removeFromCart(productId, 0);
    },
    [removeFromCart]
  );

  const handleOpenDetails = useCallback(
    (product: Product) => {
      navigation.navigate('ProductDetails', {
        productId: product.id,
        product,
        businessTypeId: user?.business_type_id ?? product.business_type_id ?? null,
      });
    },
    [navigation, user?.business_type_id]
  );

  const totalCartItems = useMemo(
    () => cart.reduce((s, c) => s + getCartLinePieceQuantity(c), 0),
    [cart]
  );

  const cartTotalPrice = useMemo(
    () => cart.reduce((s, c) => s + c.price * c.quantity, 0).toLocaleString('en-IN'),
    [cart]
  );

  useEffect(() => {
    const fetchUser = async () => {
      const userString = await AsyncStorage.getItem('user');
      if (!userString) {
        navigation.replace('Login');
        return;
      }
      const parsed = JSON.parse(userString);
      if (parsed.role !== 'retailer') {
        navigation.replace('Login');
        return;
      }
    };
    fetchUser();
  }, [navigation]);

  useEffect(() => {
    void AsyncStorage.getItem('user').then(raw => { if (raw) setUser(JSON.parse(raw)); }).catch(error => console.warn('Account load failed', error));
  }, []);
  const handleSearch = setSearch;
  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <MemoProductCard
        item={item}
        businessTypeId={user?.business_type_id}
        cart={cart}
        onAddVariant={handleAddVariant}
        onUpdateVariantQty={handleUpdateVariantQty}
        onRemoveVariant={handleRemoveVariant}
        onAddSimple={handleAddSimple}
            onUpdateSimpleQty={handleUpdateSimpleQty}
            onRemoveSimple={handleRemoveSimple}
            onOpenDetails={handleOpenDetails}
        cartSettings={cartSettings}
        productListSettings={productListSettings}
        productFieldSettings={display.fieldSettings}
        productSectionSettings={display.sectionSettings}
        schemaFields={display.schemaFields}
      />
    ),
    [
      cart,
      user?.business_type_id,
      handleAddVariant,
      handleUpdateVariantQty,
      handleRemoveVariant,
      handleAddSimple,
      handleUpdateSimpleQty,
      handleRemoveSimple,
      handleOpenDetails,
      cartSettings,
      productListSettings,
      display.fieldSettings,
      display.sectionSettings,
      display.schemaFields,
    ]
  );

  const handleRefresh = page.refresh;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Navbar user={user?.name} />

      {/* Image zoom modal */}
      <Modal
        visible={imageModalVisible && resolveCartDisplaySettings(display.cart, display.list, display.schemaFields, user?.business_type_id, display.fieldSettings, display.sectionSettings).visibleDetails.image}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setImageModalVisible(false)}>
          <Image source={{ uri: modalImage! }} style={styles.modalImage} resizeMode="contain" />
        </Pressable>
      </Modal>

      <RefreshWrapper onRefresh={handleRefresh}>
        <KeyboardAwareScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          extraScrollHeight={36}>
          <Text style={styles.pageTitle}>Browse Products</Text>
          <Text style={styles.pageSubtitle}>Add products to your cart for bulk ordering</Text>

          {totalCartItems > 0 && (
            <View style={styles.cartStrip}>
              <View style={styles.cartStripBadge}>
                <Text style={styles.cartStripBadgeText}>{totalCartItems}</Text>
              </View>
              <Text style={styles.cartStripText}>
                {totalCartItems} item{totalCartItems !== 1 ? 's' : ''} in cart
              </Text>
              <Text style={styles.cartStripTotal}>₹{cartTotalPrice}</Text>
            </View>
          )}

          {/* Search bar — mic button removed (voice requires native build) */}
          <View style={styles.searchRow}>
            <TextInput
              placeholder="Search by name, brand, or model..."
              value={search}
              onChangeText={handleSearch}
              style={styles.searchInput}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#FFFFFF" style={{ marginTop: 40 }} />
          ) : page.error ? (<Text style={styles.emptyText}>{page.error}</Text>) : filteredProducts.length === 0 ? (
            <Text style={styles.emptyText}>No products found.</Text>
          ) : (
            <FlatList
              key={`products-${columns}`}
              numColumns={columns}
              data={filteredProducts}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
              initialNumToRender={10}
              maxToRenderPerBatch={5}
              windowSize={10}
              removeClippedSubviews={true}
            />
          )}

          <CustomAlert
            visible={alertVisible}
            message={alertMsg}
            onClose={() => setAlertVisible(false)}
          />

          <View style={{ height: 16 }} />
          <PageControls key={page.key} page={page.page} total={page.total} hasMore={page.hasMore} loading={page.loading} go={page.go} refresh={page.refresh} />
        </KeyboardAwareScrollView>
      </RefreshWrapper>

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
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.82)',
    marginBottom: 10,
  },
  cartStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: OMS_COLORS.primaryBorder,
    gap: 8,
  },
  cartStripBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: OMS_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStripBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  cartStripText: {
    flex: 1,
    fontSize: 13,
    color: OMS_COLORS.primaryDeep,
    fontWeight: '700',
  },
  cartStripTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: OMS_COLORS.primaryDeep,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    fontSize: 14,
    color: '#111827',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 40,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '90%',
    height: '70%',
    borderRadius: 10,
  },
});
