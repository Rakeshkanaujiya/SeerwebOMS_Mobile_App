import { resolveCartDisplaySettings, useDealerDisplaySettings } from '../src/lib/cartSettings';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiUrl } from 'apiurl';
import ProductCart, {
  AddVariantOptions,
  Product,
  ProductVariant,
  getImageUri,
  resolveColorVariants,
} from 'components/ProductCart';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import { useCart } from '../context/CartContext';
import { createCartSnapshotItem } from '../src/lib/cart';
import { OMS_COLORS } from '../src/lib/theme';
import {
  DEFAULT_PRODUCT_FIELD_SETTINGS,
  DEFAULT_PRODUCT_LIST_SETTINGS,
  isProductFieldVisible,
  loadProductFieldSettings,
  loadProductListSettings,
  ProductFieldSettings,
  ProductListSettings,
} from '../src/lib/dealerSettings';
import type { ProductDetailsScreenProps } from '../types/navigation';

type SchemaField = {
  id: number;
  field_key: string;
  field_label: string;
  sort_order: number;
  is_variant_attribute?: number;
};

function normalizeProduct(item: any): Product {
  let attributes: Record<string, any> = {};
  if (typeof item?.attributes === 'string') {
    try {
      attributes = JSON.parse(item.attributes);
    } catch {
      attributes = {};
    }
  } else if (item?.attributes && typeof item.attributes === 'object') {
    attributes = item.attributes;
  }

  return {
    id: Number(item?.id),
    name: String(item?.name ?? ''),
    brand: String(item?.brand ?? attributes.brand ?? ''),
    model: String(item?.model ?? attributes.model ?? ''),
    price: Number(item?.price ?? 0),
    color: String(item?.color ?? attributes.color ?? ''),
    stock: Number(item?.stock ?? 0),
    description: String(item?.description ?? ''),
    dealerid: Number(item?.dealerid ?? 0),
    image: item?.image || null,
    attributes,
    business_type_id:
      item?.business_type_id === undefined || item?.business_type_id === null
        ? null
        : Number(item.business_type_id),
    variants: Array.isArray(item?.variants) ? item.variants : [],
    size_sets: Array.isArray(item?.size_sets)
      ? item.size_sets
      : Array.isArray(attributes.selected_size_sets)
        ? attributes.selected_size_sets
        : [],
  };
}

function formatAttribute(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') return '';
  return String(value ?? '').trim();
}

export default function ProductDetailsScreen({
  navigation,
  route,
}: ProductDetailsScreenProps) {
  const { productId, product: initialProduct, businessTypeId } = route.params;
  const [product, setProduct] = useState<Product | null>(
    initialProduct
      ? { ...initialProduct, business_type_id: businessTypeId ?? initialProduct.business_type_id }
      : null
  );
  const [loading, setLoading] = useState(!initialProduct);
  const display = useDealerDisplaySettings(product?.dealerid, product?.business_type_id);
  const [productFieldSettings, setProductFieldSettings] = useState<ProductFieldSettings>(
    DEFAULT_PRODUCT_FIELD_SETTINGS
  );
  const [productListSettings, setProductListSettings] = useState<ProductListSettings>(
    DEFAULT_PRODUCT_LIST_SETTINGS
  );
  const [schema, setSchema] = useState<SchemaField[]>([]);
  const { cart, addToCart, updateCartQuantity, removeFromCart } = useCart();

  useEffect(() => {
    // Product lists already return the complete record (attributes and variants).
    // Avoid a redundant details request when navigation supplied that record; the
    // deployed API may not yet expose GET /products/:id.
    if (initialProduct) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadProduct = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const response = await fetch(`${apiUrl}/products/${productId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) throw new Error('Product details could not be loaded');
        const data = await response.json();
        if (!cancelled) {
          const next = normalizeProduct(data);
          setProduct({
            ...next,
            business_type_id: businessTypeId ?? next.business_type_id,
          });
        }
      } catch (error) {
        // A failed request is handled by the empty state. Do not use
        // console.error here because Expo promotes it to a full-screen LogBox.
        if (__DEV__) console.warn('Product details load failed:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProduct();
    return () => {
      cancelled = true;
    };
  }, [businessTypeId, initialProduct, productId]);

  useEffect(() => {
    const dealerId = product?.dealerid;
    if (!dealerId) return;

    let cancelled = false;
    const loadSettings = async () => {
      const token = await AsyncStorage.getItem('token');
      const [fieldSettings, listSettings] = await Promise.all([
        loadProductFieldSettings(dealerId, token).catch(() => DEFAULT_PRODUCT_FIELD_SETTINGS),
        loadProductListSettings(dealerId, token).catch(() => DEFAULT_PRODUCT_LIST_SETTINGS),
      ]);
      if (cancelled) return;
      setProductFieldSettings(fieldSettings);
      setProductListSettings(listSettings);
    };

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [product?.dealerid]);

  useEffect(() => {
    const dealerId = product?.dealerid;
    const resolvedBusinessTypeId = product?.business_type_id ?? businessTypeId;
    if (!dealerId || !resolvedBusinessTypeId) return;

    let cancelled = false;
    const loadSchema = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const response = await fetch(
          `${apiUrl}/dealers/business-types/schema/${resolvedBusinessTypeId}?dealer_id=${encodeURIComponent(String(dealerId))}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        const data = await response.json();
        if (!cancelled) setSchema(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSchema([]);
      }
    };

    void loadSchema();
    return () => {
      cancelled = true;
    };
  }, [businessTypeId, product?.business_type_id, product?.dealerid]);

  const gallery = useMemo(() => {
    if (!product) return [];
    const galleryImages = Array.isArray(product.attributes?.gallery_images)
      ? product.attributes.gallery_images.map(String)
      : [];
    const colorImages = resolveColorVariants(product)
      .map((variant) => variant.image)
      .filter(Boolean) as string[];
    return Array.from(
      new Set(
        [product.image, ...colorImages, ...galleryImages]
          .map((image) => getImageUri(image))
          .filter(Boolean) as string[]
      )
    );
  }, [product]);

  const resolvedBusinessTypeId = Number(product?.business_type_id ?? businessTypeId ?? 0);
  // Match ProductSettingsPage: Dairy and non-Mobile/non-Garment modules are
  // schema-driven even when every configured field has been hidden.
  const isSchemaDriven = resolvedBusinessTypeId !== 1 && resolvedBusinessTypeId !== 2;

  const specifications = useMemo(() => {
    if (!product) return [];
    if (isSchemaDriven) {
      return schema
        .filter((field) => !['product_name', 'productName', 'product_image', 'description', 'size'].includes(field.field_key))
        .map((field) => {
          const raw =
            product.attributes?.[field.field_key] ??
            (field.field_key === 'brand' ? product.brand : undefined) ??
            (field.field_key === 'model' ? product.model : undefined) ??
            (field.field_key === 'stock' ? product.stock : undefined) ??
            (field.field_key === 'selling_price' ? product.price : undefined);
          return { key: field.field_key, label: field.field_label, value: formatAttribute(raw) };
        })
        .filter((entry) => Boolean(entry.value));
    }
    const hidden = new Set([
      'color_variants',
      'gallery_images',
      'available_colors',
      'product_tags',
      'product_description',
    ]);
    const fieldKeyByAttribute: Record<string, keyof ProductFieldSettings> = {
      brand: 'brand',
      design_number: 'designNumber',
      model: 'designNumber',
      launch_date: 'launchDate',
      booking_type: 'bookingType',
      master_category: 'masterCategory',
      category: 'category',
      sub_category: 'subCategory',
      fabric_type: 'fabricType',
      style_design: 'styleDesign',
      hsn_code: 'hsnCode',
      rack_number: 'rackNumber',
      fit_type: 'fitType',
      barcode_sku: 'barcodeSku',
      sku: 'barcodeSku',
      size_range: 'availableSizes',
    };
    return Object.entries(product.attributes ?? {})
      .filter(([key]) => !hidden.has(key))
      .filter(([key]) => {
        const settingKey = fieldKeyByAttribute[key];
        return !settingKey || isProductFieldVisible(productFieldSettings, settingKey);
      })
      .map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value: formatAttribute(value) }))
      .filter((entry) => Boolean(entry.value));
  }, [isSchemaDriven, product, productFieldSettings, schema]);

  const hasSchemaVariants = useMemo(
    () => schema.some((field) => field.field_key === 'size' || Number(field.is_variant_attribute) === 1),
    [schema]
  );
  const variantLabel = isSchemaDriven ? 'Variants' : 'Sizes';
  const showDescription = isSchemaDriven
    ? schema.some((field) => ['description', 'product_description'].includes(field.field_key))
    : isProductFieldVisible(productFieldSettings, 'productDescription');
  const imageVisible = resolveCartDisplaySettings(display.cart, display.list, display.schemaFields, product?.business_type_id ?? businessTypeId, display.fieldSettings, display.sectionSettings).visibleDetails.image;
  const showGallery = imageVisible && (isSchemaDriven
    ? schema.some((field) => ['product_image', 'gallery_images'].includes(field.field_key))
    : isProductFieldVisible(productFieldSettings, 'galleryImages'));

  const handleAddVariant = (
    selectedProduct: Product,
    variant: ProductVariant,
    quantity: number,
    options?: AddVariantOptions
  ) => {
    addToCart(createCartSnapshotItem(selectedProduct, quantity, variant, options));
  };

  const handleUpdateVariant = (
    selectedProductId: number,
    variantId: number | string,
    quantity: number,
    color?: string
  ) => {
    if (quantity <= 0) removeFromCart(selectedProductId, variantId, color);
    else updateCartQuantity(selectedProductId, variantId, Math.min(quantity, 999), color);
  };

  const handleAddSimple = (selectedProduct: Product, quantity = 1) => {
    addToCart(createCartSnapshotItem(selectedProduct, quantity));
  };

  if (loading && !product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator size="large" color={OMS_COLORS.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to products"
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={OMS_COLORS.primaryDeep} />
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerEyebrow}>Product Details</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {product?.name || 'Product'}
          </Text>
        </View>
      </View>

      {!product ? (
        <View style={styles.emptyState}>
          <Feather name="package" size={42} color={OMS_COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Product not found</Text>
        </View>
      ) : (
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          extraScrollHeight={36}>
          <ProductCart
            product={product}
            showSize={Number(product.business_type_id) === 2 || hasSchemaVariants}
            variantLabel={variantLabel}
            detailsMode
            cart={cart}
            onAddVariant={handleAddVariant}
            onUpdateVariantQty={handleUpdateVariant}
            onRemoveVariant={removeFromCart}
            onAddSimple={handleAddSimple}
            onUpdateSimpleQty={(id, quantity) => handleUpdateVariant(id, 0, quantity)}
            onRemoveSimple={(id) => removeFromCart(id, 0)}
            cartSettings={display.cart}
            productListSettings={display.list}
            productFieldSettings={display.fieldSettings}
            productSectionSettings={display.sectionSettings}
            schemaFields={display.schemaFields}
          />

          {showDescription ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>
                {product.description || 'No product description has been added yet.'}
              </Text>
            </View>
          ) : null}

          {showGallery && gallery.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Product Images</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.galleryRow}>
                  {gallery.map((image, index) => (
                    <View key={image} style={styles.galleryItem}>
                      <Image
                        source={{ uri: image }}
                        accessibilityLabel={`${product.name} image ${index + 1}`}
                        style={styles.galleryImage}
                        resizeMode="contain"
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product Information</Text>
            <View style={styles.specGrid}>
              {!isSchemaDriven ? (
                <>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Brand</Text>
                    <Text style={styles.specValue}>{product.brand || 'Not specified'}</Text>
                  </View>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Model</Text>
                    <Text style={styles.specValue}>{product.model || 'Not specified'}</Text>
                  </View>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Base Stock</Text>
                    <Text style={styles.specValue}>{product.stock}</Text>
                  </View>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Sizes</Text>
                    <Text style={styles.specValue}>
                      {product.variants?.map((variant) => variant.size).filter(Boolean).join(', ') ||
                        'Standard'}
                    </Text>
                  </View>
                </>
              ) : null}
              {specifications.map((entry) => (
                <View key={entry.key} style={styles.specItem}>
                  <Text style={styles.specLabel}>{entry.label}</Text>
                  <Text style={styles.specValue}>{entry.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </KeyboardAwareScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loader: {
    flex: 1,
  },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.45)',
    backgroundColor: OMS_COLORS.surfaceTint,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: OMS_COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  headerTitle: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '800',
    color: OMS_COLORS.primaryDeep,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 14,
    paddingBottom: 36,
  },
  section: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: OMS_COLORS.surfaceTint,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: OMS_COLORS.text,
  },
  description: {
    marginTop: 9,
    fontSize: 13,
    lineHeight: 21,
    color: OMS_COLORS.textMuted,
  },
  galleryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  galleryItem: {
    width: 128,
    height: 154,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: OMS_COLORS.border,
    backgroundColor: OMS_COLORS.accentSoft,
    padding: 6,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 12,
  },
  specItem: {
    width: '48%',
    minHeight: 66,
    padding: 10,
    borderRadius: 12,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  specLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: OMS_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  specValue: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '700',
    color: OMS_COLORS.text,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: OMS_COLORS.text,
  },
});
