import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AppScreen from '../../components/AppScreen';
import BottomTabNavigator from '../../components/BottomTabNavigator';
import Navbar from '../../components/Navbar';
import ScreenSkeleton from '../../components/ScreenSkeleton';
import type { Product } from '../../components/ProductCart';
import { cachedGet } from '../../src/lib/services/api';
import { getCustomerDealerId } from '../../src/lib/customers';
import { getImageUri } from '../../src/lib/cart';
import { cachedImageSource } from '../../src/lib/images';
import { logScreenError } from '../../src/lib/logging';
import { OMS_COLORS } from '../../src/lib/theme';
import { safeJsonParse } from '../../src/lib/app';
import { resolveCartDisplaySettings, useDealerDisplaySettings } from '../../src/lib/cartSettings';
import type { RootStackParamList } from '../../types/navigation';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

function parseAttributes(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  return safeJsonParse<Record<string, any>>(String(value), {});
}

function normalizeProduct(item: any): Product {
  const attributes = parseAttributes(item.attributes);
  return {
    id: Number(item.id),
    name: String(item.name ?? ''),
    brand: String(item.brand ?? attributes.brand ?? ''),
    model: String(item.model ?? attributes.model ?? ''),
    price: Number(item.price ?? 0),
    stock: Number(item.stock ?? 0),
    description: String(item.description ?? ''),
    dealerid: Number(item.dealerid ?? 0),
    image: item.image ?? null,
    size_range: String(item.size_range ?? attributes.size_range ?? ''),
    attributes,
    business_type_id: item.business_type_id ?? null,
    variants: Array.isArray(item.variants) ? item.variants : [],
    size_sets: Array.isArray(item.size_sets)
      ? item.size_sets
      : Array.isArray(attributes.selected_size_sets)
        ? attributes.selected_size_sets
        : [],
  };
}

function sizeSortValue(value: string) {
  const normalized = value.trim().toUpperCase();
  const alphaIndex = SIZE_ORDER.indexOf(normalized);
  if (alphaIndex >= 0) return alphaIndex;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return 100 + numeric;
  return 1000 + normalized.charCodeAt(0);
}

function resolveSizes(product: Product): string[] {
  const fromVariants = (product.variants ?? []).map((variant) => String(variant.size ?? '').trim());
  const fromSets = Array.isArray(product.size_sets)
    ? product.size_sets.flatMap((sizeSet: any) =>
        Array.isArray(sizeSet?.sizes) ? sizeSet.sizes.map((size: unknown) => String(size).trim()) : []
      )
    : [];
  const fromAttributes = Array.isArray(product.attributes?.available_sizes)
    ? product.attributes.available_sizes.map((size: unknown) => String(size).trim())
    : [];

  return Array.from(new Set([...fromVariants, ...fromSets, ...fromAttributes].filter(Boolean)))
    .sort((left, right) => sizeSortValue(left) - sizeSortValue(right));
}

function resolveSizeLabel(product: Product) {
  if (product.size_range) return product.size_range;
  const sizes = resolveSizes(product);
  if (sizes.length === 0) return 'Size pending';
  if (sizes.length === 1) return sizes[0];
  return `${sizes[0]}-${sizes[sizes.length - 1]}`;
}

function resolveRate(product: Product) {
  const variantRates = (product.variants ?? [])
    .map((variant) => Number(variant.rate ?? variant.mrp ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (variantRates.length > 0) return Math.min(...variantRates);
  return Number(product.price ?? 0);
}

function resolveDesign(product: Product) {
  return String(
    product.attributes?.design_number ??
      product.attributes?.design ??
      product.model ??
      product.id
  ).trim();
}

function resolveImages(product: Product) {
  const galleryImages = Array.isArray(product.attributes?.gallery_images)
    ? product.attributes.gallery_images
    : [];
  const colorImages = Array.isArray(product.attributes?.color_variants)
    ? product.attributes.color_variants.map((variant: any) => variant?.image)
    : [];

  return Array.from(
    new Set(
      [product.image, ...galleryImages, ...colorImages]
        .map((image) => getImageUri(String(image ?? '').trim()))
        .filter(Boolean) as string[]
    )
  );
}

function resolveDealerCompanyName(value?: Record<string, any> | null) {
  return String(
    value?.company_name ??
      value?.dealer_company ??
      value?.ledger ??
      value?.business_name ??
      value?.firm_name ??
      value?.name ??
      ''
  ).trim();
}

function searchText(product: Product) {
  const attributes = product.attributes ?? {};
  const colorVariants = Array.isArray(attributes.color_variants) ? attributes.color_variants : [];
  return [
    product.name,
    product.brand,
    product.model,
    attributes.design_number,
    attributes.design,
    attributes.sku,
    attributes.barcode,
    attributes.barcode_sku,
    attributes.category,
    attributes.sub_category,
    attributes.hsn_code,
    attributes.style_design,
    attributes.style_fabric,
    resolveSizeLabel(product),
    ...colorVariants.flatMap((variant: any) => [variant?.color, variant?.sku, variant?.design_number]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildShareMessage(products: Product[], companyName: string, showImage: boolean, showSizes: boolean) {
  return [
    companyName || 'Item Cards',
    '',
    products
    .map((product, index) => {
      const images = showImage ? resolveImages(product) : [];
      return [
        `${index + 1}. ${product.name}`,
        `Item Code / Design Number: ${resolveDesign(product)}`,
        product.brand ? `Brand: ${product.brand}` : null,
        showSizes ? `Available Sizes: ${resolveSizeLabel(product)}` : null,
        `Rate: Rs.${resolveRate(product).toLocaleString('en-IN')}`,
        images.length > 0 ? `Images:\n${images.join('\n')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n'),
  ].join('\n');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildShareCatalogHtml(products: Product[], companyName: string, showImage: boolean, showSizes: boolean) {
  const cards = products
    .map((product) => {
      const images = resolveImages(product);
      const imageCount = Math.max(images.length, 1);
      return `
        <article class="card">
          ${showImage ? `<div class="imageRow" style="grid-template-columns: repeat(${imageCount}, minmax(0, 1fr));">
            ${
              images.length > 0
                ? images
                    .map((image) => `<div class="imageCell"><img src="${escapeHtml(image)}" /></div>`)
                    .join('')
                : '<div class="placeholder">No Image</div>'
            }
          </div>` : ''}
          <div class="details">
            <div class="label">Design Number / Item Code</div>
            <div class="code">${escapeHtml(resolveDesign(product))}</div>
            <h2>${escapeHtml(product.name || 'Untitled product')}</h2>
            ${showSizes ? `<div class="meta">Available Size Range: <strong>${escapeHtml(resolveSizeLabel(product))}</strong></div>` : ''}
            <div class="meta">Rate: <strong>Rs.${escapeHtml(resolveRate(product).toLocaleString('en-IN'))}</strong></div>
          </div>
        </article>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, Helvetica, sans-serif;
            color: #302547;
            background: #eef7fb;
          }
          .header {
            background: linear-gradient(135deg, #62518F, #48C7EC);
            border-radius: 18px;
            color: white;
            margin-bottom: 18px;
            padding: 20px 22px;
          }
          .header h1 {
            font-size: 28px;
            margin: 0 0 6px;
          }
          .header p {
            font-size: 13px;
            margin: 0;
            opacity: 0.9;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }
          .card {
            background: white;
            border: 1px solid #D9D1EF;
            border-radius: 16px;
            break-inside: avoid;
            overflow: hidden;
          }
          .imageRow {
            background: #F8FAFC;
            display: grid;
            gap: 6px;
            min-height: 190px;
            padding: 8px;
          }
          .imageCell {
            align-items: center;
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 10px;
            display: flex;
            height: 188px;
            justify-content: center;
            min-width: 0;
            overflow: hidden;
          }
          .imageCell img {
            display: block;
            height: 100%;
            max-width: 100%;
            object-fit: contain;
            width: 100%;
          }
          .placeholder {
            align-items: center;
            color: #94A3B8;
            display: flex;
            font-size: 16px;
            font-weight: 700;
            grid-column: 1 / -1;
            justify-content: center;
            min-height: 188px;
          }
          .details {
            padding: 14px;
          }
          .label {
            color: #64748B;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.6px;
            margin-bottom: 3px;
            text-transform: uppercase;
          }
          .code {
            color: #62518F;
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 6px;
          }
          h2 {
            color: #1E293B;
            font-size: 16px;
            line-height: 1.25;
            margin: 0 0 10px;
          }
          .meta {
            color: #64748B;
            font-size: 14px;
            margin-top: 6px;
          }
          .meta strong {
            color: #302547;
          }
        </style>
      </head>
      <body>
        <section class="header">
          <h1>${escapeHtml(companyName || 'Item Cards')}</h1>
          <p>${products.length} item${products.length === 1 ? '' : 's'}</p>
        </section>
        <main class="grid">${cards}</main>
      </body>
    </html>
  `;
}

export const ShareProductCard = memo(function ShareProductCard({
  product,
  selected,
  onToggle,
  onShareOne,
  showImage,
  showSizes,
}: {
  product: Product;
  selected: boolean;
  onToggle: (productId: number) => void;
  onShareOne: (product: Product) => void;
  showImage: boolean;
  showSizes: boolean;
}) {
  const imageUri = showImage ? resolveImages(product)[0] : undefined;

  return (
    <Pressable
      onPress={() => onToggle(product.id)}
      accessibilityRole="button"
      style={[styles.card, selected && styles.cardSelected]}>
      <View style={showImage ? styles.imageWrap : styles.compactActions}>
        {showImage && (imageUri ? (
          <Image
            source={cachedImageSource(imageUri)}
            style={styles.productImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={30} color={OMS_COLORS.textSubtle} />
          </View>
        ))}
        <View style={[styles.selectDot, selected && styles.selectDotActive]}>
          {selected ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onShareOne(product);
          }}
          style={styles.shareMini}
          accessibilityRole="button">
          <Ionicons name="share-social" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.cardBody}>
        {resolveDesign(product) ? <Text style={styles.designText} numberOfLines={1}>
          {resolveDesign(product)}
        </Text> : null}
        <Text style={styles.productName} numberOfLines={2}>
          {product.name}
        </Text>
        {showSizes ? <Text style={styles.metaText} numberOfLines={1}>
          Sizes: {resolveSizeLabel(product)}
        </Text> : null}
        <Text style={styles.rateText}>Rate: Rs.{resolveRate(product).toLocaleString('en-IN')}</Text>
      </View>
    </Pressable>
  );
});

export default function ShareItemsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [products, setProducts] = useState<Product[]>([]);
  const [dealerCompanyName, setDealerCompanyName] = useState('Item Cards');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealerId, setDealerId] = useState<number | string | null>(null);
  const [businessTypeId, setBusinessTypeId] = useState<number | string | null>(null);
  const display = useDealerDisplaySettings(dealerId, businessTypeId);
  const visibility = resolveCartDisplaySettings(display.cart, display.list, display.schemaFields, businessTypeId, display.fieldSettings, display.sectionSettings).visibleDetails;

  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      setLoading(true);
      try {
        const [userText, token] = await Promise.all([
          AsyncStorage.getItem('user'),
          AsyncStorage.getItem('token'),
        ]);
        const user = safeJsonParse<Record<string, any> | null>(userText, null);
        const dealerId = getCustomerDealerId(user);
        if (!token || !dealerId) {
          setProducts([]);
          return;
        }
        if (!cancelled) {
          setDealerId(dealerId);
          setBusinessTypeId(user?.business_type_id ?? null);
        }

        const userCompanyName = resolveDealerCompanyName(user);
        if (!cancelled && userCompanyName) setDealerCompanyName(userCompanyName);

        const [data, dealerData] = await Promise.all([
          cachedGet(`/products?dealerid=${dealerId}`, token),
          userCompanyName
            ? Promise.resolve(null)
            : cachedGet(`/dealers/${dealerId}/users`, token).catch((error) => {
                logScreenError('ShareItemsScreen.loadDealerProfile', error);
                return null;
              }),
        ]);

        if (!cancelled) {
          const dealerCompanyName = resolveDealerCompanyName(dealerData?.dealer ?? dealerData);
          if (dealerCompanyName) setDealerCompanyName(dealerCompanyName);
          setProducts((data ?? []).map(normalizeProduct));
          setBusinessTypeId(user?.business_type_id ?? data?.[0]?.business_type_id ?? null);
        }
      } catch (error) {
        logScreenError('ShareItemsScreen.loadProducts', error);
        if (!cancelled) Alert.alert('Unable to load items', 'Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => searchText(product).includes(needle));
  }, [products, query]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.includes(product.id)),
    [products, selectedIds]
  );

  const allVisibleSelected = filteredProducts.length > 0 &&
    filteredProducts.every((product) => selectedIds.includes(product.id));

  const toggleProduct = useCallback((productId: number) => {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((current) => {
      const visibleIds = filteredProducts.map((product) => product.id);
      if (visibleIds.length === 0) return current;
      const hasAll = visibleIds.every((id) => current.includes(id));
      if (hasAll) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }, [filteredProducts]);

  const shareProducts = useCallback(async (items: Product[]) => {
    if (items.length === 0) {
      Alert.alert('Select items', 'Please select at least one item to share.');
      return;
    }

    try {
      const canShareFiles = await Sharing.isAvailableAsync();
      if (canShareFiles) {
        const file = await Print.printToFileAsync({
          html: buildShareCatalogHtml(items, dealerCompanyName, visibility.image, visibility.variant),
          base64: false,
        });
        await Sharing.shareAsync(file.uri, {
          dialogTitle: 'Share Item Cards',
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
        return;
      }

      await Share.share({
        title: dealerCompanyName || 'Item Cards',
        message: buildShareMessage(items, dealerCompanyName, visibility.image, visibility.variant),
      });
    } catch (error) {
      logScreenError('ShareItemsScreen.shareProducts', error);
      Alert.alert('Share failed', 'Unable to open the share sheet.');
    }
  }, [dealerCompanyName, visibility.image, visibility.variant]);

  const renderProduct = useCallback(
    ({ item }: { item: Product }) => (
      <ShareProductCard
        product={item}
        showImage={visibility.image}
        showSizes={visibility.variant}
        selected={selectedIds.includes(item.id)}
        onToggle={toggleProduct}
        onShareOne={(product) => shareProducts([product])}
      />
    ),
    [selectedIds, shareProducts, toggleProduct, visibility.image, visibility.variant]
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.hero}>
        <Pressable style={styles.backButton} onPress={() => navigation.navigate('MoreScreen')}>
          <Ionicons name="arrow-back" size={22} color={OMS_COLORS.primaryDeep} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Share Items</Text>
          <Text style={styles.subtitle}>Search products, select cards, and share a catalog.</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={20} color={OMS_COLORS.textSubtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, design, SKU, barcode..."
          placeholderTextColor={OMS_COLORS.textSubtle}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={OMS_COLORS.textSubtle} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <Pressable onPress={toggleSelectAll} style={styles.secondaryButton}>
          <Ionicons
            name={allVisibleSelected ? 'remove-circle-outline' : 'checkmark-circle-outline'}
            size={18}
            color={OMS_COLORS.primary}
          />
          <Text style={styles.secondaryButtonText}>
            {allVisibleSelected ? 'Clear visible' : 'Select all'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => shareProducts(selectedProducts)}
          style={[styles.primaryButton, selectedProducts.length === 0 && styles.primaryButtonDisabled]}>
          <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>
            Share {selectedProducts.length > 0 ? `(${selectedProducts.length})` : ''}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.resultText}>
        {filteredProducts.length} item{filteredProducts.length === 1 ? '' : 's'} found
      </Text>
    </View>
  );

  return (
    <AppScreen>
      <Navbar />
      {loading ? (
        <ScreenSkeleton rows={4} />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderProduct}
          numColumns={2}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={34} color={OMS_COLORS.textSubtle} />
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptyText}>Try a different product name, design number, or SKU.</Text>
            </View>
          }
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}
      <BottomTabNavigator />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 14,
    paddingBottom: 118,
  },
  header: {
    marginBottom: 12,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    padding: 14,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 3,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 50,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: OMS_COLORS.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: OMS_COLORS.surfaceTint,
    borderColor: OMS_COLORS.primaryBorder,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 46,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: OMS_COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: OMS_COLORS.primary,
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 46,
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  resultText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 10,
  },
  column: {
    gap: 10,
  },
  card: {
    backgroundColor: OMS_COLORS.surfaceTint,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    flex: 1,
    marginBottom: 10,
    maxWidth: '50%',
    overflow: 'hidden',
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  cardSelected: {
    borderColor: OMS_COLORS.success,
    borderWidth: 2,
  },
  imageWrap: {
    aspectRatio: 0.9,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  compactActions: {
    height: 52,
    position: 'relative',
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  selectDot: {
    alignItems: 'center',
    backgroundColor: '#22C55E',
    borderColor: '#FFFFFF',
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    left: 8,
    position: 'absolute',
    top: 8,
    width: 22,
  },
  selectDotActive: {
    backgroundColor: OMS_COLORS.success,
  },
  shareMini: {
    alignItems: 'center',
    backgroundColor: OMS_COLORS.primary,
    borderRadius: 18,
    bottom: 8,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    width: 36,
  },
  cardBody: {
    padding: 10,
    gap: 4,
  },
  designText: {
    color: OMS_COLORS.primaryDeep,
    fontSize: 18,
    fontWeight: '900',
  },
  productName: {
    color: OMS_COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    minHeight: 35,
  },
  metaText: {
    color: OMS_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  rateText: {
    color: OMS_COLORS.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 20,
    marginTop: 10,
    padding: 26,
  },
  emptyTitle: {
    color: OMS_COLORS.primaryDeep,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 8,
  },
  emptyText: {
    color: OMS_COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
