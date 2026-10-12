import {
  CartSettings,
  DEFAULT_CART_SETTINGS,
  DealerProductSchemaField,
  hasDealerSchemaField,
  isDealerSchemaFieldVisible,
} from '../src/lib/cartSettings';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiUrl } from 'apiurl';
import { OMS_COLORS } from '../src/lib/theme';
import {
  DEFAULT_PRODUCT_LIST_SETTINGS,
  DEFAULT_PRODUCT_FIELD_SETTINGS,
  DEFAULT_PRODUCT_SECTION_SETTINGS,
  isProductListColumnVisible,
  isProductFieldVisible,
  isProductSectionVisible,
  ProductFieldSettings,
  ProductListSettings,
  ProductSectionSettings,
} from '../src/lib/dealerSettings';
import { cachedImageSource } from '../src/lib/images';

export interface ProductVariant {
  id: number | string;
  size?: string;
  color?: string;
  rate?: number;
  mrp?: number;
  qty: number;
  rack?: string;
}

export interface ProductColorVariant {
  color: string;
  hex?: string;
  image?: string;
  sku?: string;
  price?: number;
  stock?: number;
  design_number?: string;
}

export interface ProductSizeSet {
  id: string;
  name: string;
  sizeSystemKey?: string;
  sizes: string[];
}

export interface Product {
  id: number;
  name: string;
  brand?: string;
  model?: string;
  price: number;
  stock_item_rate?: number;
  party_rate?: number | null;
  effective_rate?: number;
  color?: string;
  stock: number;
  description?: string;
  dealerid: number;
  image?: string | null;
  size_range?: string;
  attributes?: Record<string, any>;
  business_type_id?: number | null;
  variants?: ProductVariant[];
  size_sets?: ProductSizeSet[];
  productListSettings?: ProductListSettings;
  productFieldSettings?: ProductFieldSettings;
  productSectionSettings?: ProductSectionSettings;
  schemaFields?: DealerProductSchemaField[] | null;
}

export interface CartItem {
  productId: number;
  variantId: number | string;
  size?: string;
  color?: string;
  price: number;
  quantity: number;
  stock: number;
  businessTypeId?: number | null;
}

export interface AddVariantOptions {
  color?: string;
  setQuantity?: number;
  selectedSizes?: string[];
  image?: string;
  sku?: string;
  price?: number;
  stock?: number;
  designNumber?: string;
  orderMode?: 'piece' | 'size_set';
  sizeSetId?: string;
  sizeSetName?: string;
  sizeSetSizes?: string[];
}

interface ProductCartProps {
  cartSettings?: CartSettings;
  schemaFields?: DealerProductSchemaField[] | null;
  productListSettings?: ProductListSettings;
  productFieldSettings?: ProductFieldSettings;
  productSectionSettings?: ProductSectionSettings;
  product: Product;
  showSize?: boolean;
  variantLabel?: string;
  detailsMode?: boolean;
  editAction?: React.ReactNode;
  onOpenDetails?: (product: Product) => void;
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
}

const BLUE = OMS_COLORS.text;
const PRIMARY = OMS_COLORS.primary;
const BORDER = OMS_COLORS.border;

export const getImageUri = (img: string | null | undefined): string | null => {
  if (!img) return null;
  if (img.startsWith('http')) return img;
  return `${apiUrl}/${img}`;
};

const resolveColor = (product: Product): string => {
  const direct = String(product.color ?? '').trim();
  if (direct && direct !== 'null' && direct !== 'undefined') return direct;

  const attrColor = String(product.attributes?.color ?? '').trim();
  if (attrColor && attrColor !== 'null' && attrColor !== 'undefined') return attrColor;

  return '';
};

export const resolveColors = (product: Product): string[] => {
  const configuredColors = resolveColorVariants(product).map((variant) => variant.color);
  if (configuredColors.length > 0) return uniqueColors(configuredColors);

  const availableColors = product.attributes?.available_colors;
  if (Array.isArray(availableColors)) {
    return uniqueColors(availableColors.map((value) => String(value).trim()).filter(Boolean));
  }

  return uniqueColors(
    resolveColor(product)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
};

const uniqueColors = (colors: string[]): string[] => {
  const seen = new Set<string>();
  return colors.filter((color) => {
    const key = color.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const resolveColorVariants = (product: Product): ProductColorVariant[] => {
  const rawVariants = product.attributes?.color_variants;
  if (!Array.isArray(rawVariants)) return [];

  return rawVariants
    .map((entry) => {
      const color = String(entry?.color ?? '').trim();
      if (!color) return null;
      const price =
        entry?.price === undefined || entry?.price === null || entry?.price === ''
          ? undefined
          : Number(entry.price);
      const stock =
        entry?.stock === undefined || entry?.stock === null || entry?.stock === ''
          ? undefined
          : Number(entry.stock);

      return {
        color,
        hex: String(entry?.hex ?? '').trim() || undefined,
        image: String(entry?.image ?? '').trim() || undefined,
        sku: String(entry?.sku ?? '').trim() || undefined,
        price: price !== undefined && Number.isFinite(price) ? price : undefined,
        stock: stock !== undefined && Number.isFinite(stock) ? stock : undefined,
        design_number: String(entry?.design_number ?? '').trim() || undefined,
      };
    })
    .filter(Boolean) as ProductColorVariant[];
};

const formatINR = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

const getVariantRate = (product: Product, variant: ProductVariant) =>
  Number(product.party_rate ?? product.effective_rate ?? variant.rate ?? variant.mrp ?? product.price ?? 0);

const getVariantMrp = (product: Product, variant: ProductVariant) =>
  Number(variant.mrp ?? variant.rate ?? product.price ?? 0);

function normalizeProductSizeSets(value: unknown): ProductSizeSet[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
      const name = String(row.name ?? '').trim();
      const sizes = Array.isArray(row.sizes)
        ? Array.from(new Set(row.sizes.map((size) => String(size).trim()).filter(Boolean)))
        : [];

      if (!name || sizes.length === 0) return null;

      return {
        id: String(row.id ?? name).trim() || name,
        name,
        sizeSystemKey: String(row.sizeSystemKey ?? row.size_system_key ?? '').trim() || undefined,
        sizes,
      } satisfies ProductSizeSet;
    })
    .filter(Boolean) as ProductSizeSet[];
}

export function resolveSizeSets(product: Product): ProductSizeSet[] {
  const savedSizeSets = normalizeProductSizeSets(product.size_sets);
  if (savedSizeSets.length > 0) return savedSizeSets;

  return normalizeProductSizeSets(product.attributes?.selected_size_sets);
}

const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

function sortVariantSizes(variants: ProductVariant[]): ProductVariant[] {
  return [...variants].sort((left, right) => {
    const leftSize = String(left.size ?? '').toUpperCase();
    const rightSize = String(right.size ?? '').toUpperCase();
    const leftIndex = sizeOrder.indexOf(leftSize);
    const rightIndex = sizeOrder.indexOf(rightSize);
    const safeLeft = leftIndex >= 0 ? leftIndex : sizeOrder.length + leftSize.charCodeAt(0);
    const safeRight = rightIndex >= 0 ? rightIndex : sizeOrder.length + rightSize.charCodeAt(0);
    return safeLeft - safeRight;
  });
}

interface QuantityStepperProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  visible?: boolean;
  minimum?: number;
}

function QuantityStepper({ value, onChange, compact = false, visible = true, minimum = 1 }: QuantityStepperProps) {
  if (!visible) return null;
  const parsed = Number.parseInt(value, 10);
  const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const update = (next: number) => onChange(String(Math.max(minimum, next)));

  return (
    <View style={[styles.quantityStepper, compact && styles.quantityStepperCompact]}>
      <Pressable
        accessibilityLabel="Decrease quantity"
        onPress={() => update(quantity - 1)}
        style={styles.quantityStepButton}>
        <Feather name="minus" size={14} color={PRIMARY} />
      </Pressable>
      <TextInput
        value={value || '1'}
        onChangeText={(next) => onChange(next.replace(/[^0-9]/g, '') || '1')}
        keyboardType="number-pad"
        selectTextOnFocus
        style={styles.quantityStepInput}
      />
      <Pressable
        accessibilityLabel="Increase quantity"
        onPress={() => update(quantity + 1)}
        style={styles.quantityStepButton}>
        <Feather name="plus" size={14} color={PRIMARY} />
      </Pressable>
    </View>
  );
}

export default function ProductCart({
  product,
  showSize = false,
  variantLabel = 'Sizes',
  detailsMode = false,
  editAction,
  onOpenDetails,
  cart,
  onAddVariant,
  onUpdateVariantQty,
  onRemoveVariant,
  onAddSimple,
  onUpdateSimpleQty,
  productListSettings = DEFAULT_PRODUCT_LIST_SETTINGS,
  productFieldSettings = DEFAULT_PRODUCT_FIELD_SETTINGS,
  productSectionSettings = DEFAULT_PRODUCT_SECTION_SETTINGS,
  cartSettings = DEFAULT_CART_SETTINGS,
  schemaFields,
}: ProductCartProps) {
  const [simpleQuantity, setSimpleQuantity] = useState('1');
  const visible = cartSettings.visibleDetails;
  const hidden = { display: 'none' as const };
  const [imgError, setImgError] = useState(false);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [selectedSizeSetIds, setSelectedSizeSetIds] = useState<string[]>([]);
  const [pendingSetQty, setPendingSetQty] = useState('1');
  const [pieceQuantities, setPieceQuantities] = useState<Record<string, string>>({});
  const [mobileQuantities, setMobileQuantities] = useState<Record<string, string>>({});

  const variants = useMemo(() => sortVariantSizes(product.variants ?? []), [product.variants]);
  const savedSizeSets = useMemo(() => resolveSizeSets(product), [product]);
  const selectedSizeSets = useMemo(
    () => savedSizeSets.filter((sizeSet) => selectedSizeSetIds.includes(sizeSet.id)),
    [savedSizeSets, selectedSizeSetIds]
  );
  const selectedSizeSetSizes = useMemo(
    () =>
      Array.from(
        new Set(selectedSizeSets.flatMap((sizeSet) => sizeSet.sizes).filter(Boolean))
      ),
    [selectedSizeSets]
  );
  const setOrderSizes = savedSizeSets.length > 0
    ? selectedSizeSetSizes
    : variants.map((variant) => variant.size || 'NA').filter(Boolean);
  const colorVariants = useMemo(() => resolveColorVariants(product), [product]);
  const colors = useMemo(() => resolveColors(product), [product]);
  const [selectedColor, setSelectedColor] = useState(colors[0] ?? '');
  const selectedColorVariant = colorVariants.find(
    (variant) => variant.color.toLowerCase() === selectedColor.toLowerCase()
  );
  const imageUri = getImageUri(selectedColorVariant?.image || product.image);
  const selectedPrice = selectedColorVariant?.price ?? product.price;
  const selectedStock = selectedColorVariant?.stock;
  const selectedDesignNumber =
    selectedColorVariant?.design_number ||
    product.attributes?.design_number ||
    product.attributes?.design ||
    product.model ||
    '';
  const selectedSku = selectedColorVariant?.sku || '';
  const colorUnavailable = selectedStock !== undefined && selectedStock <= 0;
  const hasVariants = variants.length > 0;
  const usesSchemaSettings = Number(product.business_type_id) !== 1 && Number(product.business_type_id) !== 2;
  const isDairyProduct = Number(product.business_type_id) === 3;
  const isGarmentProduct =
    (showSize || Number(product.business_type_id) === 2) && hasVariants;
  const isMobileVariantProduct = !isDairyProduct && !isGarmentProduct && hasVariants;
  const schemaFieldVisible = (...keys: string[]) =>
    !usesSchemaSettings || (schemaFields !== null && isDealerSchemaFieldVisible(schemaFields, ...keys));
  const legacyFieldVisible = (
    field: keyof ProductFieldSettings,
    section: keyof ProductSectionSettings
  ) => isProductFieldVisible(productFieldSettings, field) && isProductSectionVisible(productSectionSettings, section);
  const isListVisible = (key: keyof ProductListSettings) => {
    if (usesSchemaSettings) {
      const schemaKeys: Partial<Record<keyof ProductListSettings, string[]>> = {
        productImage: ['product_image', 'main_product_image', 'mainProductImage'],
        productName: ['product_name', 'productName', 'name'],
        designNumber: ['design_number', 'designNumber', 'model'],
        rate: ['selling_price', 'price', 'rate'],
        brand: ['brand'],
        category: ['category', 'stock_group'],
        subCategory: ['sub_category', 'subCategory'],
        styleDesign: ['style_design', 'styleDesign'],
        launchDate: ['launch_date', 'launchDate'],
        size: ['size', 'weight_volume'],
        stock: ['stock', 'inventory'],
        color: ['color', 'colour'],
      };
      const fieldKeys = schemaKeys[key];
      // Unknown schema state fails closed for configurable fields. Once loaded,
      // the API's is_visible/is_deleted values decide whether each field renders.
      if (schemaFields === null) return false;
      if (!fieldKeys) return true;
      if (key === 'productImage' && !hasDealerSchemaField(schemaFields, ...fieldKeys)) return false;
      return isDealerSchemaFieldVisible(schemaFields, ...fieldKeys);
    }

    const legacyFieldByColumn: Partial<Record<keyof ProductListSettings, [keyof ProductFieldSettings, keyof ProductSectionSettings]>> = {
      productImage: ['mainProductImage', 'imagesGallery'],
      productName: ['productName', 'productInformation'],
      designNumber: ['designNumber', 'productInformation'],
      rate: ['rateSetup', 'rateSetup'],
      brand: ['brand', 'productInformation'],
      category: ['category', 'productInformation'],
      subCategory: ['subCategory', 'productInformation'],
      styleDesign: ['styleDesign', 'productInformation'],
      launchDate: ['launchDate', 'productInformation'],
      size: ['availableSizes', 'sizesColors'],
      color: ['availableColors', 'sizesColors'],
    };
    const legacyField = legacyFieldByColumn[key];
    return isProductListColumnVisible(productListSettings, key) &&
      (!legacyField || legacyFieldVisible(legacyField[0], legacyField[1])) &&
      (key !== 'productImage' || visible.image) && (key !== 'productName' || visible.productName) &&
      (key !== 'rate' || visible.price) && (key !== 'category' || visible.category) &&
      (key !== 'productImage' || schemaFieldVisible('product_image', 'main_product_image', 'mainProductImage'));
  };

  useEffect(() => {
    if (!__DEV__) return;
    const imageField = schemaFields?.find((field) =>
      ['productimage', 'mainproductimage'].includes(
        String(field.field_key ?? '').trim().toLowerCase().replace(/[\s_-]/g, '')
      )
    );
    console.log('[ProductCartVisibility] effective product card setting', {
      productId: product.id,
      productName: product.name,
      businessTypeId: product.business_type_id,
      schemaFieldKey: imageField?.field_key ?? null,
      rawIsVisible: imageField?.is_visible ?? null,
      rawIsDeleted: imageField?.is_deleted ?? null,
      normalizedVisible: isListVisible('productImage'),
      imageUriPresent: Boolean(imageUri),
    });
  }, [product.id, product.name, product.business_type_id, schemaFields, productListSettings, imageUri]);

  useEffect(() => {
    if (!colors.some((color) => color.toLowerCase() === selectedColor.toLowerCase())) {
      setSelectedColor(colors[0] ?? '');
    }
  }, [colors, selectedColor]);

  useEffect(() => {
    setImgError(false);
  }, [imageUri]);

  useEffect(() => {
    if (!isGarmentProduct) return;

    setPieceQuantities((current) => {
      const nextState: Record<string, string> = {};
      selectedVariantIds.forEach((variantId) => {
        nextState[variantId] = current[variantId] ?? '1';
      });
      return nextState;
    });
  }, [isGarmentProduct, selectedVariantIds]);

  useEffect(() => {
    setSelectedSizeSetIds((current) => {
      if (savedSizeSets.length === 0) return [];
      const validIds = new Set(savedSizeSets.map((sizeSet) => sizeSet.id));
      const next = current.filter((id) => validIds.has(id));
      return next.length > 0 ? next : [savedSizeSets[0].id];
    });
  }, [savedSizeSets]);

  const getCartVariant = (variantId: number | string, color?: string): CartItem | undefined =>
    cart.find(
      (entry) =>
        entry.productId === product.id &&
        String(entry.variantId) === String(variantId) &&
        (color === undefined || String(entry.color ?? '') === String(color ?? ''))
    );

  const getCartSimple = (): CartItem | undefined =>
    cart.find((entry) => entry.productId === product.id && entry.variantId === 0);

  const totalInCart = cart
    .filter((entry) => entry.productId === product.id)
    .reduce((sum, entry) => sum + entry.quantity, 0);

  const setSummary =
    savedSizeSets.length > 0
      ? selectedSizeSets.map((sizeSet) => sizeSet.name).join(' + ') || 'Select size set'
      : variants.map((variant) => variant.size || 'NA').join(' + ');

  const toggleSelectedVariant = (variantId: number | string) => {
    const key = String(variantId);
    setSelectedVariantIds((current) =>
      current.includes(key)
        ? current.filter((id) => id !== key)
        : [...current, key]
    );
  };

  const handlePieceQtyChange = (variantId: number | string, value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    setPieceQuantities((current) => ({
      ...current,
      [String(variantId)]: sanitized,
    }));
  };

  const toggleSizeSet = (sizeSetId: string) => {
    setSelectedSizeSetIds((current) =>
      current.includes(sizeSetId)
        ? current.filter((id) => id !== sizeSetId)
        : [...current, sizeSetId]
    );
  };

  const selectedPieceEntries = useMemo(
    () =>
      variants
        .filter((variant) => selectedVariantIds.includes(String(variant.id)))
        .map((variant) => {
          const rawQuantity = parseInt(pieceQuantities[String(variant.id)] ?? '1', 10);
          const quantity = Number.isNaN(rawQuantity) ? 0 : rawQuantity;
          return quantity > 0 ? { variant, quantity } : null;
        })
        .filter(Boolean) as { variant: ProductVariant; quantity: number }[],
    [pieceQuantities, selectedVariantIds, variants]
  );

  const selectedPieceCount = selectedPieceEntries.reduce((sum, entry) => sum + entry.quantity, 0);

  const handleAddSelectedSizes = () => {
    if (selectedPieceEntries.length === 0 || colorUnavailable) return;

    selectedPieceEntries.forEach(({ variant, quantity }) => {
      onAddVariant(product, variant, quantity, {
        color: selectedColor,
        selectedSizes: selectedPieceEntries.map((entry) => entry.variant.size || 'NA'),
        image: selectedColorVariant?.image,
        sku: selectedSku,
        price: selectedPrice,
        stock: selectedStock,
        designNumber: selectedDesignNumber,
      });
    });

    setSelectedVariantIds([]);
    setPieceQuantities({});
  };

  const handleAddSet = () => {
    const count = parseInt(pendingSetQty, 10);
    if (Number.isNaN(count) || count <= 0 || colorUnavailable) return;
    if (setOrderSizes.length === 0) return;

    if (savedSizeSets.length > 0) {
      selectedSizeSets.forEach((sizeSet) => {
        const sizeSetSizes = sizeSet.sizes.filter(Boolean);
        const matchingVariants = variants.filter((variant) =>
          sizeSetSizes.includes(String(variant.size ?? ''))
        );
        const baseVariant = matchingVariants[0];
        if (!baseVariant) return;

        const setRate = matchingVariants.reduce(
          (sum, variant) => sum + getVariantRate(product, variant),
          0
        );
        const setMrp = matchingVariants.reduce(
          (sum, variant) => sum + getVariantMrp(product, variant),
          0
        );
        const setStock = Math.max(
          0,
          Math.min(...matchingVariants.map((variant) => Number(variant.qty ?? 0)))
        );
        const resolvedSizes = matchingVariants.map((variant) => variant.size || 'NA');

        onAddVariant(
          product,
          {
            ...baseVariant,
            id: `size-set:${sizeSet.id}:${selectedColor || 'default'}`,
            size: sizeSet.name,
            color: selectedColor,
            rate: setRate,
            mrp: setMrp,
            qty: setStock,
          },
          count,
          {
            color: selectedColor,
            setQuantity: count,
            selectedSizes: resolvedSizes,
            image: selectedColorVariant?.image,
            sku: selectedSku,
            price: setRate,
            stock: setStock,
            designNumber: selectedDesignNumber,
            orderMode: 'size_set',
            sizeSetId: sizeSet.id,
            sizeSetName: sizeSet.name,
            sizeSetSizes: resolvedSizes,
          }
        );
      });

      setPendingSetQty('1');
      return;
    }

    variants.forEach((variant) => {
      onAddVariant(product, variant, count, {
        color: selectedColor,
        setQuantity: count,
        selectedSizes: variants.map((entry) => entry.size || 'NA'),
        image: selectedColorVariant?.image,
        sku: selectedSku,
        price: selectedPrice,
        stock: selectedStock,
        designNumber: selectedDesignNumber,
      });
    });

    setPendingSetQty('1');
  };

  const cartSimple = getCartSimple();
  const showRate = isListVisible('rate');

  return (
    <View
      style={[
        styles.card,
        totalInCart > 0 && styles.cardActive,
        detailsMode && styles.detailsCard,
      ]}>
      {isListVisible('productImage') ? (
        <Pressable
          disabled={!onOpenDetails || detailsMode}
          accessibilityRole={onOpenDetails && !detailsMode ? 'link' : undefined}
          accessibilityLabel={
            onOpenDetails && !detailsMode ? `View details for ${product.name}` : undefined
          }
          onPress={() => onOpenDetails?.(product)}
          style={styles.imageShell}>
          {imageUri && !imgError ? (
            <Image
              key={`${product.id}-${selectedColor}-${imageUri}`}
              source={cachedImageSource(imageUri)}
              style={styles.image}
              resizeMode="contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>No Image</Text>
            </View>
          )}
        </Pressable>
      ) : null}

      <View style={styles.body}>
        {editAction ? <View style={styles.editRow}>{editAction}</View> : null}
        <View style={styles.titleRow}>
          <Pressable
            disabled={!onOpenDetails || detailsMode}
            onPress={() => onOpenDetails?.(product)}
            style={[styles.detailsLinkArea, styles.titleColumn]}>
            {isListVisible('designNumber') && selectedDesignNumber ? (
              <Text style={styles.productCode}>
                {selectedDesignNumber}
              </Text>
            ) : null}
            {isListVisible('productName') ? (
              <Text style={styles.title} numberOfLines={detailsMode ? undefined : 2}>
                {product.name}
              </Text>
            ) : null}
            {showRate ? (
              <View style={styles.priceBlock}>
                <Text style={styles.priceLabel}>Rate</Text>
                <Text style={styles.priceValue} numberOfLines={1}>
                  {formatINR(selectedPrice)}
                </Text>
              </View>
            ) : null}
            {isListVisible('stock') && selectedStock !== undefined ? (
              <View style={styles.variantMetaRow}>
                <Text
                  style={[
                    styles.variantMetaText,
                    selectedStock <= 0 && styles.variantMetaOut,
                  ]}>
                  {selectedStock > 0 ? `${selectedStock} in stock` : 'Out of stock'}
                </Text>
              </View>
            ) : null}
          </Pressable>

        </View>

        {isListVisible('color') && colors.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Colors</Text>
            <View style={styles.colorWrap}>
              {colors.map((color, index) => (
                <Pressable
                  key={`${color}-${index}`}
                  onPress={() => setSelectedColor(color)}
                  style={[
                    styles.colorPill,
                    selectedColor === color && styles.activeColorPill,
                  ]}>
                  <Text
                    style={[
                      styles.colorText,
                      selectedColor === color && styles.activeColorText,
                    ]}>
                    {color}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {isGarmentProduct ? (
          <>
            <Text style={styles.sectionLabel}>{variantLabel}</Text>
            <View style={styles.sizesWrap}>
              {variants.map((variant) => {
                const inCart = getCartVariant(variant.id, selectedColor)?.quantity ?? 0;
                const isSelected = selectedVariantIds.includes(String(variant.id));

                return (
                  <Pressable
                    key={variant.id}
                    onPress={() => toggleSelectedVariant(variant.id)}
                    style={[styles.sizePill, isSelected && styles.sizePillSelected]}>
                    <Text style={[styles.sizePillText, isSelected && styles.sizePillTextSelected]}>
                      {variant.size || 'NA'}
                    </Text>
                    {inCart > 0 ? <Text style={styles.sizeCount}>{inCart}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            {selectedVariantIds.length > 0 ? (
              <View style={styles.pieceCard}>
                <View style={styles.pieceHeader}>
                  <Text style={styles.pieceHeading}>Piece-Wise Ordering</Text>
                  <Text style={styles.pieceHint}>Enter qty per size</Text>
                </View>

                <View style={styles.pieceGrid}>
                  {variants
                    .filter((variant) => selectedVariantIds.includes(String(variant.id)))
                    .map((variant) => (
                      <View key={variant.id} style={styles.pieceRow}>
                        <View style={styles.pieceSizeChip}>
                          <Text style={styles.pieceSizeChipText}>{variant.size || 'NA'}</Text>
                        </View>
                        <QuantityStepper visible={visible.quantity}
                          value={pieceQuantities[String(variant.id)] ?? '1'}
                          onChange={(value) => handlePieceQtyChange(variant.id, value)}
                          compact
                        />
                      </View>
                    ))}
                </View>

                <Pressable
                  onPress={handleAddSelectedSizes}
                  disabled={selectedPieceEntries.length === 0 || colorUnavailable}
                  style={[
                    styles.addToCartBtn,
                    styles.pieceAddButton,
                    !visible.buttons && hidden,
                    (selectedPieceEntries.length === 0 || colorUnavailable) &&
                      styles.addToCartBtnDisabled,
                  ]}>
                  <Feather name="plus" size={15} color="#FFFFFF" />
                  <Text style={styles.addToCartText}>
                    {selectedPieceCount > 0
                      ? `Add ${selectedPieceCount} Pc${selectedPieceCount > 1 ? 's' : ''} To Cart`
                      : 'Add To Cart'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.setCard, !visible.setCount && hidden]}>
              {savedSizeSets.length > 0 ? (
                <View style={styles.sizeSetBlock}>
                  <Text style={styles.sizeSetLabel}>Size Sets</Text>
                  <View style={styles.sizeSetWrap}>
                    {savedSizeSets.map((sizeSet) => {
                      const active = selectedSizeSetIds.includes(sizeSet.id);
                      return (
                        <Pressable
                          key={sizeSet.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => toggleSizeSet(sizeSet.id)}
                          style={[styles.sizeSetPill, active && styles.sizeSetPillActive]}>
                          <Text
                            style={[
                              styles.sizeSetPillText,
                              active && styles.sizeSetPillTextActive,
                            ]}>
                            {sizeSet.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              <View style={styles.setRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.setHeading}>Set Ordering</Text>
                  <Text style={styles.setSubtitle}>1 set = {setSummary}</Text>
                  {savedSizeSets.length > 0 ? (
                    <Text style={styles.setSizesSubtitle}>
                      {variantLabel}: {setOrderSizes.join(' + ') || 'No size set selected'}
                    </Text>
                  ) : null}
                </View>
                <QuantityStepper visible={visible.quantity && visible.setCount}
                  value={pendingSetQty}
                  onChange={setPendingSetQty}
                />
              </View>
              <Pressable
                onPress={handleAddSet}
                disabled={colorUnavailable || setOrderSizes.length === 0}
                style={[
                  styles.setButton,
                  !visible.buttons && hidden,
                  (colorUnavailable || setOrderSizes.length === 0) && styles.setButtonDisabled,
                ]}>
                <Feather name="shopping-bag" size={14} color="#FFFFFF" />
                <Text style={styles.setButtonText}>Add Sets To Cart</Text>
              </Pressable>
            </View>
          </>
        ) : isMobileVariantProduct ? (
          <View style={styles.mobileVariantSection}>
            <View style={styles.mobileHeader}>
              <Text style={[styles.mobileHeaderText, { flex: 1 }]}>Variant</Text>
              {isListVisible('rate') && <Text style={styles.mobileHeaderText}>Rate</Text>}
              {visible.quantity && <Text style={styles.mobileHeaderText}>Qty</Text>}
              <View style={{ width: 44 }} />
            </View>
            {variants.map((variant) => {
              const lineColor = variant.color || selectedColor;
              const lineColorVariant = colorVariants.find(
                (entry) => entry.color.toLowerCase() === lineColor.toLowerCase()
              );
              const cartVariant = getCartVariant(variant.id, lineColor);
              const quantity = mobileQuantities[String(variant.id)] ?? '1';
              const rate = Number(
                product.party_rate ??
                  product.effective_rate ??
                  lineColorVariant?.price ??
                  selectedPrice ??
                  variant.rate ??
                  variant.mrp ??
                  product.price
              );

              return (
                <View key={variant.id} style={styles.mobileVariantRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mobileVariantName}>
                      {[variant.size, variant.color].filter(Boolean).join(' / ') || 'Standard'}
                    </Text>
                  </View>
                  <Text style={[styles.mobileVariantRate, !isListVisible('rate') && hidden]}>{formatINR(rate)}</Text>
                  {cartVariant ? (
                    <View style={[styles.mobileStepper, !visible.quantity && hidden]}>
                      <Pressable
                        onPress={() =>
                          onUpdateVariantQty(
                            product.id,
                            variant.id,
                            cartVariant.quantity - 1,
                            lineColor
                          )
                        }
                        style={styles.mobileStepButton}>
                        <Feather name="minus" size={13} color={PRIMARY} />
                      </Pressable>
                      <Text style={styles.mobileStepQuantity}>{cartVariant.quantity}</Text>
                      <Pressable
                        onPress={() =>
                          onUpdateVariantQty(
                            product.id,
                            variant.id,
                            cartVariant.quantity + 1,
                            lineColor
                          )
                        }
                        style={styles.mobileStepButton}>
                        <Feather name="plus" size={13} color={PRIMARY} />
                      </Pressable>
                    </View>
                  ) : (
                    <QuantityStepper visible={visible.quantity}
                      value={quantity}
                      onChange={(value) =>
                        setMobileQuantities((current) => ({
                          ...current,
                          [String(variant.id)]: value,
                        }))
                      }
                      compact
                    />
                  )}
                  {cartVariant ? (
                    <Pressable
                      onPress={() => onRemoveVariant(product.id, variant.id, lineColor)}
                      style={[styles.mobileRemoveButton, !visible.buttons && hidden]}>
                      <Feather name="trash-2" size={14} color={OMS_COLORS.danger} />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => {
                        const parsed = Number.parseInt(quantity, 10);
                        if (!Number.isFinite(parsed) || parsed <= 0) return;
                        onAddVariant(
                          product,
                          { ...variant, rate, qty: selectedStock ?? variant.qty },
                          parsed,
                          {
                            color: lineColor,
                            image: lineColorVariant?.image ?? selectedColorVariant?.image,
                            sku: lineColorVariant?.sku ?? selectedSku,
                            price: rate,
                            stock: lineColorVariant?.stock ?? selectedStock,
                            designNumber:
                              lineColorVariant?.design_number ?? selectedDesignNumber,
                          }
                        );
                        setMobileQuantities((current) => ({
                          ...current,
                          [String(variant.id)]: '1',
                        }));
                      }}
                      style={[styles.mobileAddButton, !visible.buttons && hidden]}>
                      <Feather name="plus" size={14} color={OMS_COLORS.surface} />
                      <Text style={styles.mobileAddText}>Add</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.simpleRow, { flexWrap: 'wrap', gap: 8 }]}>
            {visible.quantity && <QuantityStepper minimum={cartSimple ? 0 : 1} value={cartSimple ? String(cartSimple.quantity) : simpleQuantity}
              onChange={value => cartSimple ? onUpdateSimpleQty(product.id, Number(value)) : setSimpleQuantity(value)} compact />}
            {visible.buttons && !cartSimple && <Pressable onPress={() => onAddSimple(product, Math.max(1, Number(simpleQuantity) || 1))} style={styles.addToCartBtn}>
              <Feather name="plus" size={15} color="#FFFFFF" /><Text style={styles.addToCartText}>Add</Text>
            </Pressable>}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardActive: {
    borderColor: '#BFDBFE',
  },
  detailsCard: {
    marginBottom: 0,
  },
  detailsLinkArea: {
    borderRadius: 12,
  },
  imageShell: {
    height: 176,
    backgroundColor: OMS_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: 196,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#94A3B8',
  },
  body: {
    padding: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 48,
  },
  editRow: {
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 4,
  },
  productCode: {
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: OMS_COLORS.primaryDeep,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: BLUE,
  },
  priceBlock: {
    alignItems: 'flex-start',
    marginTop: 8,
  },
  priceLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '900',
    color: BLUE,
    textAlign: 'left',
  },
  variantMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
  },
  variantMetaText: {
    borderRadius: 6,
    backgroundColor: OMS_COLORS.primarySoft,
    color: OMS_COLORS.primaryDeep,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  variantMetaOut: {
    backgroundColor: OMS_COLORS.dangerSoft,
    color: OMS_COLORS.danger,
  },
  sectionLabel: {
    marginTop: 12,
    marginBottom: 7,
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  colorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  colorPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.surface,
  },
  activeColorPill: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  colorText: {
    color: OMS_COLORS.primaryDeep,
    fontWeight: '700',
    fontSize: 11,
  },
  activeColorText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  sizesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  sizePill: {
    minWidth: 38,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  sizePillStatic: {
    backgroundColor: '#FFFFFF',
  },
  sizePillSelected: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  sizePillDisabled: {
    opacity: 0.35,
  },
  sizePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  sizePillTextSelected: {
    color: '#FFFFFF',
  },
  sizePillTextDisabled: {
    color: '#94A3B8',
  },
  sizeCount: {
    position: 'absolute',
    right: 2,
    top: 1,
    fontSize: 9,
    color: PRIMARY,
    fontWeight: '800',
  },
  pieceCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: OMS_COLORS.primarySoft,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  pieceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  pieceHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: BLUE,
  },
  pieceHint: {
    fontSize: 10,
    color: '#64748B',
  },
  pieceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  pieceRow: {
    width: '47%',
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pieceSizeChip: {
    minWidth: 42,
    height: 34,
    borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  pieceSizeChipDisabled: {
    backgroundColor: '#CBD5E1',
  },
  pieceSizeChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pieceInput: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    fontSize: 13,
    color: BLUE,
  },
  pieceInputDisabled: {
    backgroundColor: '#E2E8F0',
    color: '#94A3B8',
  },
  quantityStepper: {
    width: 134,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.surface,
  },
  quantityStepperCompact: {
    width: 106,
    height: 42,
  },
  quantityStepButton: {
    width: 34,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OMS_COLORS.primarySoft,
  },
  quantityStepInput: {
    minWidth: 28,
    flex: 1,
    height: '100%',
    paddingHorizontal: 2,
    paddingVertical: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: OMS_COLORS.text,
  },
  pieceAddButton: {
    marginTop: 10,
  },
  setCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: OMS_COLORS.primarySoft,
    padding: 10,
  },
  sizeSetBlock: {
    marginBottom: 10,
  },
  sizeSetLabel: {
    marginBottom: 7,
    fontSize: 10,
    fontWeight: '800',
    color: OMS_COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sizeSetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  sizeSetPill: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.primarySoft,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sizeSetPillActive: {
    borderColor: PRIMARY,
    backgroundColor: OMS_COLORS.surface,
  },
  sizeSetPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: OMS_COLORS.primary,
  },
  sizeSetPillTextActive: {
    color: OMS_COLORS.primaryDeep,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: BLUE,
  },
  setSubtitle: {
    marginTop: 2,
    fontSize: 10,
    color: '#64748B',
  },
  setSizesSubtitle: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    color: '#64748B',
  },
  setInput: {
    height: 40,
    width: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    fontSize: 13,
    color: BLUE,
  },
  setButton: {
    height: 42,
    borderRadius: 8,
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  setButtonDisabled: {
    opacity: 0.45,
  },
  setButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bottomActions: {
    marginTop: 18,
  },
  addToCartBtn: {
    minWidth: 88,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  addToCartBtnDisabled: {
    opacity: 0.45,
  },
  addToCartText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  simpleRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  simplePrice: {
    fontSize: 15,
    fontWeight: '800',
    color: BLUE,
  },
  simpleStock: {
    marginTop: 2,
    fontSize: 10,
    color: '#64748B',
  },
  simpleStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  simpleStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  simpleStepQty: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  mobileVariantSection: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mobileHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  mobileHeaderText: {
    width: 58,
    fontSize: 9,
    fontWeight: '800',
    color: OMS_COLORS.textMuted,
    textTransform: 'uppercase',
  },
  mobileVariantRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: OMS_COLORS.border,
    backgroundColor: OMS_COLORS.surface,
  },
  mobileVariantName: {
    fontSize: 11,
    fontWeight: '700',
    color: OMS_COLORS.text,
  },
  mobileVariantRate: {
    width: 58,
    fontSize: 11,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },
  mobileQtyInput: {
    width: 58,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.surface,
    textAlign: 'center',
    color: OMS_COLORS.text,
  },
  mobileStepper: {
    width: 100,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  mobileStepButton: {
    width: 32,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileStepQuantity: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: OMS_COLORS.primaryDeep,
  },
  mobileAddButton: {
    minWidth: 70,
    minHeight: 38,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: PRIMARY,
    paddingHorizontal: 10,
  },
  mobileAddText: {
    fontSize: 12,
    fontWeight: '800',
    color: OMS_COLORS.surface,
  },
  mobileRemoveButton: {
    minWidth: 44,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: OMS_COLORS.dangerSoft,
  },
});
