import { CartSettings, DealerProductSchemaField, useDealerDisplaySettings } from '../../src/lib/cartSettings';
import { useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { apiUrl } from 'apiurl';
import BottomTabNavigator from 'components/BottomTabNavigator';
import CustomAlert from 'components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../types/navigation';
import { apiGet } from 'src/lib/services/api';
import { useServerPage, useDebouncedValue } from '../../src/lib/useServerPage';
import PageControls from '../../components/PageControls';
import { Picker } from '@react-native-picker/picker';
import Navbar from 'components/Navbar';
import ProductCart, {
  Product,
  ProductVariant,
  CartItem,
  AddVariantOptions,
} from 'components/ProductCart';
import { useCart } from '../../context/CartContext';
import { createCartSnapshotItem, getCartLinePieceQuantity } from '../../src/lib/cart';
import {
  hydrateStaffCreateCustomerPermission,
  refreshAuthenticatedUser,
} from '../../src/lib/auth';
import { getCustomerDealerId } from '../../src/lib/customers';
import { canManageProductsForUser } from '../../src/lib/permissions';
import { OMS_COLORS } from '../../src/lib/theme';
import AppScreen from '../../components/AppScreen';
import KeyboardAwareScrollView from '../../components/KeyboardAwareScrollView';
import ScreenSkeleton from '../../components/ScreenSkeleton';
import {
  DEFAULT_PRODUCT_FIELD_SETTINGS,
  DEFAULT_PRODUCT_LIST_SETTINGS,
  DEFAULT_PRODUCT_SECTION_SETTINGS,
  getCachedProductSettings,
  loadProductListSettings,
  ProductListSettings,
} from '../../src/lib/dealerSettings';
import { logScreenError } from '../../src/lib/logging';
import { useCartPricing } from '../../src/lib/useCartPricing';


/* -------------------- INTERFACES -------------------- */

const DAIRY_PRODUCT_EXCEL_COLUMNS = [
  'Product Name',
  'Category',
  'Brand',
  'SKU',
  'Barcode',
  'Purchase Price',
  'Selling Price',
  'MRP',
  'GST %',
  'Stock',
  'Minimum Stock',
  'Pack Size',
  'Unit',
  'Packaging',
  'Flavor',
  'Type',
  'Storage',
  'Batch Number',
  'Manufacturing Date',
  'Expiry Date',
  'Shelf Life',
  'Storage Type',
  'Supplier Name',
  'Description',
] as const;

const normalizeExcelHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const getExcelValue = (row: Record<string, any>, column: string) => {
  const expected = normalizeExcelHeader(column);
  const matchedKey = Object.keys(row).find((key) => normalizeExcelHeader(key) === expected);
  return matchedKey ? row[matchedKey] : '';
};

const toExcelNumber = (value: unknown) => {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeProductPayload = (item: any): Product => {
  let attrs: Record<string, any> = {};
  if (item.attributes) {
    try {
      attrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
    } catch (error) {
      logScreenError('StaffScreen.parseProductAttributes', error, { productId: item.id });
      attrs = {};
    }
  }

  return {
    id: Number(item.id),
    name: item.name || '',
    brand: item.brand || attrs.brand || '',
    model: item.model || attrs.model || '',
    price: Number(item.effective_rate ?? item.price),
    stock_item_rate: item.stock_item_rate == null ? undefined : Number(item.stock_item_rate),
    party_rate: item.party_rate == null ? undefined : Number(item.party_rate),
    effective_rate: item.effective_rate == null ? undefined : Number(item.effective_rate),
    stock: Number(item.stock),
    description: item.description || '',
    dealerid: Number(item.dealerid),
    image: item.image || null,
    size_range: item.size_range || attrs.size_range || '',
    attributes: attrs,
    business_type_id: item.business_type_id ?? null,
    variants: item.variants ?? [],
    size_sets: Array.isArray(item.size_sets)
      ? item.size_sets
      : Array.isArray(attrs.selected_size_sets)
        ? attrs.selected_size_sets
        : [],
  };
};

interface Retailer {
  id: number;
  username?: string;
  name: string;
  contact_person?: string;
  ledger: string;
  email?: string;
  phone: string;
  address: string;
  city?: string;
  assigned?: string | number | null;
}

/* -------------------- MEMOIZED PRODUCT CARD -------------------- */

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
  canEditProducts: boolean;
  onEditProduct: (product: Product) => void;
  productListSettings: ProductListSettings;
  productFieldSettings: typeof DEFAULT_PRODUCT_FIELD_SETTINGS;
  productSectionSettings: typeof DEFAULT_PRODUCT_SECTION_SETTINGS;
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
    canEditProducts,
    onEditProduct,
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
      <View style={{ position: 'relative', flex: 1, marginHorizontal: 4 }}>
        <ProductCart
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
        />
        {canEditProducts ? (
          <Pressable
            onPress={() => onEditProduct(item)}
            hitSlop={8}
            accessibilityLabel={`Edit ${item.name || 'item'}`}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: OMS_COLORS.border,
              elevation: 3,
            }}>
            <Ionicons name="create-outline" size={18} color={OMS_COLORS.primary} />
          </Pressable>
        ) : null}
      </View>
    );
  }
);
MemoProductCard.displayName = 'MemoProductCard';

/* -------------------- MAIN SCREEN -------------------- */

export default function StaffScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'StaffScreen'>>();
  const { cart, addToCart, updateCartQuantity, removeFromCart } = useCart();

  const [user, setUser] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [selectedRetailer, setSelectedRetailer] = useState<Retailer | null>(null);
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [activeTab, setActiveTab] = useState<'customers' | 'products'>(
    route.params?.activeTab === 'products' ? 'products' : 'customers'
  );
  const productSearch = useDebouncedValue(search);
  const retailerSearch = useDebouncedValue(customerSearch);
  const dealerId = getCustomerDealerId(user);
  const cartPricing = useCartPricing(Number(dealerId), Number(selectedRetailer?.id ?? 0));
  const customerPage = useServerPage<Retailer>(dealerId ? `/retailers?dealerid=${dealerId}&search=${encodeURIComponent(retailerSearch)}` : null, 'retailers');
  const productEndpoint = dealerId && initialized
    ? `/products?dealerid=${dealerId}&create_order=1&retailer_id=${selectedRetailer?.id ?? ''}&search=${encodeURIComponent(productSearch)}&category=${encodeURIComponent(category)}&brand=${encodeURIComponent(brand)}`
    : null;
  const productPage = useServerPage<any>(productEndpoint, 'products');
  const filteredRetailers = customerPage.rows;
  const filteredProducts = useMemo(() => productPage.rows.map(normalizeProductPayload), [productPage.rows]);
  const loading = !initialized || productPage.loading || cartPricing.loading;
  const customersLoading = !initialized || customerPage.loading;
  const productsError = initialError || productPage.error;
  const customersError = initialError || customerPage.error;
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const displaySettings = useDealerDisplaySettings(dealerId, user?.business_type_id);
  const productListSettings = displaySettings.list;
  const productFieldSettings = displaySettings.fieldSettings;
  const productSectionSettings = displaySettings.sectionSettings;
  const cartSettings = displaySettings.cart;
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(cartSettings.cardsPerRow, Math.floor((width - 24) / 280)));
  const appliedRefreshMarkers = useRef({
    customers: route.params?.refreshCustomersAt,
    products: route.params?.refreshProductsAt,
  });
  useFocusEffect(useCallback(() => {
    const customerMarker = route.params?.refreshCustomersAt;
    const productMarker = route.params?.refreshProductsAt;
    if (customerMarker && customerMarker !== appliedRefreshMarkers.current.customers) {
      appliedRefreshMarkers.current.customers = customerMarker;
      customerPage.refresh();
    }
    if (productMarker && productMarker !== appliedRefreshMarkers.current.products) {
      appliedRefreshMarkers.current.products = productMarker;
      productPage.refresh();
    }
  }, [customerPage.refresh, productPage.refresh, route.params?.refreshCustomersAt, route.params?.refreshProductsAt]));

  const canManageProducts = canManageProductsForUser(user);

  /* -------------------- ALERT -------------------- */

  const showAlert = useCallback((msg: string) => {
    setAlertMsg(msg);
    setAlertVisible(true);
  }, []);

  const openEditItem = useCallback(
    (product: Product) => {
      if (!canManageProducts) {
        showAlert('You do not have permission to create or edit items.');
        return;
      }
      navigation.navigate('CreateItemMaster', { product, returnTo: 'StaffScreen' });
    },
    [canManageProducts, navigation, showAlert]
  );

  /* -------------------- CART HELPERS -------------------- */

  const handleAddVariant = useCallback(
    (
      product: Product,
      variant: ProductVariant,
      qty: number,
      options?: AddVariantOptions
    ) => {
      addToCart(createCartSnapshotItem(product, qty, variant, options));
    },
    [addToCart]
  );

  const handleUpdateVariantQty = useCallback(
    (productId: number, variantId: number | string, qty: number, color?: string) => {
      if (qty <= 0) removeFromCart(productId, variantId, color);
      else updateCartQuantity(productId, variantId, qty, color);
    },
    [removeFromCart, updateCartQuantity]
  );

  const handleRemoveVariant = useCallback(
    (productId: number, variantId: number | string, color?: string) =>
      removeFromCart(productId, variantId, color),
    [removeFromCart]
  );

  const handleAddSimple = useCallback(
    (product: Product, quantity = 1) => {
      addToCart(createCartSnapshotItem(product, quantity));
    },
    [addToCart]
  );

  const handleUpdateSimpleQty = useCallback(
    (productId: number, qty: number) => {
      if (qty <= 0) removeFromCart(productId, 0);
      else updateCartQuantity(productId, 0, qty);
    },
    [removeFromCart, updateCartQuantity]
  );

  const handleRemoveSimple = useCallback(
    (productId: number) => removeFromCart(productId, 0),
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

  const handleImportDairyProducts = useCallback(async () => {
    if (!canManageProducts) {
      showAlert('You do not have permission to import products.');
      return;
    }
    if (Number(user?.business_type_id) !== 3) {
      showAlert('Dairy import is available only for Dairy dealers.');
      return;
    }

    const dealerId = getCustomerDealerId(user);
    if (!dealerId) {
      showAlert('Dealer ID is missing.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const fileResponse = await fetch(result.assets[0].uri);
      const buffer = await fileResponse.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, blankrows: false });
      const headerRow = (rows[0] || []).map((header) => normalizeExcelHeader(header));
      const expectedHeaders = DAIRY_PRODUCT_EXCEL_COLUMNS.map((header) => normalizeExcelHeader(header));
      const headerMatches =
        headerRow.length === expectedHeaders.length &&
        expectedHeaders.every((header, index) => headerRow[index] === header);

      if (!headerMatches) {
        showAlert(`Invalid Dairy template. Required columns: ${DAIRY_PRODUCT_EXCEL_COLUMNS.join(', ')}`);
        return;
      }

      const json = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '', raw: false });
      const productsToImport = json.map((row: Record<string, any>, index: number) => {
        const productName = String(getExcelValue(row, 'Product Name') || '').trim();
        const sellingPrice = toExcelNumber(getExcelValue(row, 'Selling Price'));
        const packSize = String(getExcelValue(row, 'Pack Size') || '').trim();

        if (!productName) throw new Error(`Row ${index + 2} is missing Product Name`);
        if (sellingPrice <= 0) throw new Error(`Row ${index + 2} must include Selling Price greater than 0`);
        if (!packSize) throw new Error(`Row ${index + 2} is missing Pack Size`);

        return {
          product_name: productName,
          category: String(getExcelValue(row, 'Category') || '').trim(),
          brand: String(getExcelValue(row, 'Brand') || '').trim(),
          sku: String(getExcelValue(row, 'SKU') || '').trim(),
          barcode: String(getExcelValue(row, 'Barcode') || '').trim(),
          purchase_price: toExcelNumber(getExcelValue(row, 'Purchase Price')),
          selling_price: sellingPrice,
          mrp: toExcelNumber(getExcelValue(row, 'MRP')),
          gst_percent: toExcelNumber(getExcelValue(row, 'GST %')),
          stock: toExcelNumber(getExcelValue(row, 'Stock')),
          minimum_stock_alert: toExcelNumber(getExcelValue(row, 'Minimum Stock')),
          size: packSize,
          unit: String(getExcelValue(row, 'Unit') || '').trim(),
          packaging: String(getExcelValue(row, 'Packaging') || '').trim(),
          flavor: String(getExcelValue(row, 'Flavor') || '').trim(),
          dairy_type: String(getExcelValue(row, 'Type') || '').trim(),
          storage: String(getExcelValue(row, 'Storage') || '').trim(),
          batch_number: String(getExcelValue(row, 'Batch Number') || '').trim(),
          manufacturing_date: String(getExcelValue(row, 'Manufacturing Date') || '').trim(),
          expiry_date: String(getExcelValue(row, 'Expiry Date') || '').trim(),
          shelf_life: String(getExcelValue(row, 'Shelf Life') || '').trim(),
          storage_type: String(getExcelValue(row, 'Storage Type') || '').trim(),
          supplier_name: String(getExcelValue(row, 'Supplier Name') || '').trim(),
          description: String(getExcelValue(row, 'Description') || '').trim(),
          dealerid: Number(dealerId),
          business_type_id: 3,
        };
      });

      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${apiUrl}/products/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products: productsToImport, business_type_id: 3 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(
          payload?.messages?.error || payload?.message || payload?.error || 'Failed to import products'
        );
      }

      const inserted = (payload.insertedProducts || []).map(normalizeProductPayload);
      productPage.refresh();
      showAlert(`Imported ${inserted.length} Dairy products successfully.`);
    } catch (error) {
      logScreenError('StaffScreen.importDairyProducts', error);
      showAlert(error instanceof Error ? error.message : 'Dairy import failed.');
    }
  }, [canManageProducts, showAlert, user]);

  /* -------------------- CART TOTALS -------------------- */

  const totalCartItems = useMemo(
    () => cart.reduce((s, c) => s + getCartLinePieceQuantity({
      quantity: c.quantity,
      orderMode: c.orderMode,
      sizeSetSizes: c.sizeSetSizes,
      garmentMeta: c.garmentMeta && 'sizeSetSizes' in c.garmentMeta
        ? { sizeSetSizes: (c.garmentMeta as any).sizeSetSizes }
        : undefined,
    }), 0),
    [cart]
  );

  const cartTotalPrice = useMemo(
    () => cart.reduce((s, c) => s + c.price * c.quantity, 0).toLocaleString('en-IN'),
    [cart]
  );

  /* -------------------- RETAILER SELECTION -------------------- */

  const handleSelectRetailer = async (retailer: Retailer) => {
    setSelectedRetailer(retailer);
    await AsyncStorage.setItem('selectedRetailer', JSON.stringify(retailer));
    setActiveTab('products');
  };

  /* -------------------- SEARCH -------------------- */

  const handleRetailerSearch = setCustomerSearch;
  const handleProductSearch = setSearch;

  /* -------------------- FETCH DATA -------------------- */

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [raw, token, saved] = await Promise.all([AsyncStorage.getItem('user'), AsyncStorage.getItem('token'), AsyncStorage.getItem('selectedRetailer')]);
        if (!raw || !token) { navigation.navigate('Login' as never); return; }
        let actor = JSON.parse(raw);
        if (!['dealer', 'staff'].includes(actor.role)) { navigation.navigate('Login' as never); return; }
        if (actor.role === 'staff' && (actor.can_create_products === undefined || actor.can_create_retailers === undefined)) actor = await hydrateStaffCreateCustomerPermission(actor, token);
        if (!active) return;
        setUser(actor);
        void refreshAuthenticatedUser(token, actor).then(fresh => { if (active) setUser(fresh); }).catch(error => logScreenError('StaffScreen.refreshProfile', error));
        const owner = getCustomerDealerId(actor);
        if (!owner) return;
        const savedId = route.params?.createdCustomerId ?? (saved ? JSON.parse(saved).id : null);
        if (savedId) {
          const result = await apiGet(`/retailers?dealerid=${owner}&id=${savedId}&page=1&per_page=1`, token);
          if (active) setSelectedRetailer(result.retailers?.[0] ?? null);
        }
        if (active && route.params?.activeTab) setActiveTab(route.params.activeTab === 'products' ? 'products' : 'customers');
      } catch (error) { logScreenError('StaffScreen.initialize', error); if (active) setInitialError('Unable to load your account. Please sign in again.'); }
      finally { if (active) setInitialized(true); }
    })();
    return () => { active = false; };
  }, [navigation, route.params?.createdCustomerId, route.params?.refreshCustomersAt, route.params?.refreshProductsAt]);

  /* -------------------- RENDER ITEM -------------------- */

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
            canEditProducts={canManageProducts}
            onEditProduct={openEditItem}
            cartSettings={cartSettings}
            productListSettings={productListSettings}
            productFieldSettings={productFieldSettings}
            productSectionSettings={productSectionSettings}
            schemaFields={displaySettings.schemaFields}
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
      canManageProducts,
      openEditItem,
      productListSettings,
      productFieldSettings,
      productSectionSettings,
      cartSettings,
      displaySettings.schemaFields,
    ]
  );

  /* -------------------- MAIN RETURN -------------------- */

  return (
    <AppScreen>
      <Navbar user={user?.name} />

      {/* ---------- TOP TABS ---------- */}
      <View
        style={{
          backgroundColor: OMS_COLORS.surfaceTint,
          padding: 8,
          marginHorizontal: 12,
          marginVertical: 8,
          borderRadius: 16,
          elevation: 2,
          shadowColor: OMS_COLORS.primaryDeep,
          shadowOpacity: 0.12,
          shadowRadius: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.72)',
        }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 6 }}>
          {(['customers', 'products'] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                android_ripple={{ color: OMS_COLORS.primaryBorder, borderless: false }}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  backgroundColor: isActive ? OMS_COLORS.primary : '#FFFFFF',
                  paddingVertical: 0,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  height: 52,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: OMS_COLORS.primary,
                }}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  style={{
                    color: isActive ? '#FFFFFF' : OMS_COLORS.primary,
                    fontSize: 12,
                    fontWeight: '800',
                    textAlign: 'center',
                    textTransform: 'capitalize',
                  }}>
                  {tab === 'customers' ? 'Customers' : 'Create Order'}
                </Text>
              </Pressable>
            );
          })}
        </View>

      </View>

      {/* ---------- CUSTOMERS TAB ---------- */}
      {activeTab === 'customers' && (
        <KeyboardAwareScrollView
          style={{ flex: 1, paddingHorizontal: 12 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          extraScrollHeight={36}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#FFFFFF' }}>
              Select Customer
            </Text>
          </View>

          <TextInput
            placeholder="Search customers..."
            style={{
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.72)',
              borderRadius: 14,
              paddingHorizontal: 14,
              height: 46,
              backgroundColor: 'rgba(255,255,255,0.94)',
              marginBottom: 12,
            }}
            placeholderTextColor={OMS_COLORS.textSubtle}
            onChangeText={handleRetailerSearch}
          />

          {customersLoading ? (
            <ScreenSkeleton rows={4} />
          ) : customersError ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <Text style={{ color: '#B91C1C', textAlign: 'center' }}>{customersError}</Text>
            </View>
          ) : filteredRetailers.length === 0 ? (
            <View style={{ paddingVertical: 36, alignItems: 'center' }}>
              <Ionicons name="people-outline" size={34} color="#CBD5E1" />
              <Text style={{ color: '#94A3B8', marginTop: 8 }}>No customers found.</Text>
            </View>
          ) : (
          <FlatList
            data={filteredRetailers}
            keyExtractor={(r) => r.id.toString()}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelectRetailer(item)}
                style={{
                  backgroundColor: OMS_COLORS.surfaceTint,
                  padding: 14,
                  marginBottom: 10,
                  borderRadius: 18,
                  elevation: 2,
                  borderWidth: selectedRetailer?.id === item.id ? 2 : 0.5,
                  borderColor: selectedRetailer?.id === item.id ? OMS_COLORS.accent : 'rgba(255,255,255,0.72)',
                }}>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontWeight: '600', fontSize: 15 }}>
                      {item.ledger || item.name}
                    </Text>
                    <Text style={{ color: '#6B7280', marginTop: 2 }}>
                      {item.name} · {item.phone}
                    </Text>
                    <Text
                      style={{ color: '#9CA3AF', marginTop: 2, fontSize: 12 }}
                      numberOfLines={2}>
                      {item.address}
                    </Text>
                  </View>

                  <View style={{ justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={() =>
                        item.phone
                          ? Linking.openURL(`tel:${item.phone}`)
                          : showAlert('Phone not available')
                      }
                      style={{
                        backgroundColor: OMS_COLORS.primary,
                        padding: 8,
                        borderRadius: 50,
                        marginBottom: 6,
                      }}>
                      <Ionicons name="call" size={18} color="white" />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (!item.address) return showAlert('Address not available');
                        const url = Platform.select({
                          ios: `maps:0,0?q=${encodeURIComponent(item.address)}`,
                          android: `geo:0,0?q=${encodeURIComponent(item.address)}`,
                        });
                        if (url) Linking.openURL(url);
                      }}
                      style={{ backgroundColor: OMS_COLORS.accentDark, padding: 8, borderRadius: 50 }}>
                      <Ionicons name="location" size={18} color="white" />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            )}
          />
          )}
          <PageControls key={customerPage.key} page={customerPage.page} total={customerPage.total} hasMore={customerPage.hasMore} loading={customerPage.loading} go={customerPage.go} refresh={customerPage.refresh} />
        </KeyboardAwareScrollView>
      )}

      {/* ---------- PRODUCTS TAB ---------- */}
      {activeTab === 'products' ? (
        <KeyboardAwareScrollView
          style={{ flex: 1, paddingHorizontal: 12 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          extraScrollHeight={36}>
          {/* Selected customer banner / warning */}
          {selectedRetailer ? (
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderRadius: 14,
                padding: 10,
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 0.5,
                borderColor: OMS_COLORS.primaryBorder,
              }}>
              <Ionicons name="storefront-outline" size={18} color={OMS_COLORS.primary} />
              <Text style={{ marginLeft: 8, color: OMS_COLORS.primaryDeep, fontWeight: '700', flex: 1 }}>
                {selectedRetailer.ledger || selectedRetailer.name}
              </Text>
              <Pressable onPress={() => setActiveTab('customers')}>
                <Text style={{ color: OMS_COLORS.accentDark, fontSize: 12, fontWeight: '700' }}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: OMS_COLORS.primarySoft,
                borderRadius: 14,
                padding: 10,
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 0.5,
                borderColor: OMS_COLORS.primaryBorder,
              }}>
              <Ionicons name="information-circle-outline" size={18} color={OMS_COLORS.primary} />
              <Text
                style={{ marginLeft: 8, color: OMS_COLORS.primaryDeep, flex: 1, fontSize: 13 }}>
                Please select a customer first
              </Text>
              <Pressable onPress={() => setActiveTab('customers')}>
                <Text style={{ color: OMS_COLORS.primary, fontSize: 12, fontWeight: '600' }}>
                  Go →
                </Text>
              </Pressable>
            </View>
          )}

          {canManageProducts && Number(user?.business_type_id) === 3 ? (
            <Pressable
              onPress={handleImportDairyProducts}
              style={{
                minHeight: 44,
                borderRadius: 14,
                marginBottom: 12,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: OMS_COLORS.primary,
              }}>
              <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
                Import Dairy Products Excel
              </Text>
            </Pressable>
          ) : null}

          {/* Cart summary strip */}
          {totalCartItems > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderRadius: 14,
                padding: 10,
                marginBottom: 12,
                borderWidth: 0.5,
                borderColor: OMS_COLORS.primaryBorder,
                gap: 8,
              }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: OMS_COLORS.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ fontSize: 11, color: '#fff', fontWeight: '500' }}>
                  {totalCartItems}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: OMS_COLORS.primaryDeep, fontWeight: '700' }}>
                {totalCartItems} item{totalCartItems !== 1 ? 's' : ''} in cart
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: OMS_COLORS.primaryDeep }}>
                {cartPricing.loading ? 'Refreshing prices...' : cartPricing.error ? 'Price refresh failed' : `₹${cartTotalPrice}`}
              </Text>
            </View>
          )}

          {/* Search */}
          <TextInput
            placeholder="Search by name, brand, or model..."
            value={search}
            onChangeText={handleProductSearch}
            style={{
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.72)',
              borderRadius: 14,
              paddingHorizontal: 14,
              height: 42,
              backgroundColor: 'rgba(255,255,255,0.94)',
              marginBottom: 14,
              fontSize: 14,
              color: '#111827',
            }}
            placeholderTextColor="#9CA3AF"
          />

          <View style={{ flexDirection: 'row' }}>
            <Picker style={{ flex: 1 }} selectedValue={category} onValueChange={setCategory} accessibilityLabel="Category filter">
              <Picker.Item label="All categories" value="" />
              {productPage.filters.categories.map(value => <Picker.Item key={value} label={value} value={value} />)}
            </Picker>
            <Picker style={{ flex: 1 }} selectedValue={brand} onValueChange={setBrand} accessibilityLabel="Brand filter">
              <Picker.Item label="All brands" value="" />
              {productPage.filters.brands.map(value => <Picker.Item key={value} label={value} value={value} />)}
            </Picker>
          </View>
          {loading ? (
            <ScreenSkeleton rows={4} />
          ) : productsError ? (
            <Text style={{ textAlign: 'center', color: '#B91C1C', marginTop: 40 }}>
              {productsError}
            </Text>
          ) : filteredProducts.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#9CA3AF', marginTop: 40 }}>
              No products found.
            </Text>
          ) : (
            <FlatList
              key={`products-${columns}`}
              numColumns={columns}
              data={filteredProducts}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
              scrollEnabled={false}
              initialNumToRender={10}
              maxToRenderPerBatch={5}
              windowSize={10}
              removeClippedSubviews={true}
            />
          )}
          <PageControls key={productPage.key} page={productPage.page} total={productPage.total} hasMore={productPage.hasMore} loading={productPage.loading} go={productPage.go} refresh={productPage.refresh} />
        </KeyboardAwareScrollView>
      ) : null}

      {/* ✅ CustomAlert is OUTSIDE all tab conditionals so the Modal
          always renders at the SafeAreaView level with proper full-screen
          overlay — this fixes the top-left corner positioning bug */}
      <CustomAlert
        visible={alertVisible}
        message={alertMsg}
        onClose={() => setAlertVisible(false)}
      />

      <BottomTabNavigator />
    </AppScreen>
  );
}
