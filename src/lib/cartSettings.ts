import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl } from 'apiurl';
import { apiGet } from './services/api';
import {
  DEFAULT_PRODUCT_FIELD_SETTINGS,
  DEFAULT_PRODUCT_LIST_SETTINGS,
  DEFAULT_PRODUCT_SECTION_SETTINGS,
  isProductFieldVisible,
  isProductSectionVisible,
  loadProductSettings,
  ProductFieldSettings,
  ProductListSettings,
  ProductSectionSettings,
} from './dealerSettings';

export type DealerProductSchemaField = {
  field_key?: string;
  section_key?: string;
  is_visible?: boolean | number | string;
  is_deleted?: boolean | number | string;
};

function settingIsEnabled(value: unknown, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !['false', '0', 'no', 'off', ''].includes(String(value).trim().toLowerCase());
}

function normalizedFieldKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
}

export function isDealerSchemaFieldVisible(
  fields: DealerProductSchemaField[] | null | undefined,
  ...fieldKeys: string[]
) {
  if (!fields) return true;
  const aliases = new Set(fieldKeys.map(normalizedFieldKey));
  const field = fields.find((candidate) => aliases.has(normalizedFieldKey(candidate.field_key)));
  return !field || (settingIsEnabled(field.is_visible) && !settingIsEnabled(field.is_deleted, false));
}

export function hasDealerSchemaField(
  fields: DealerProductSchemaField[] | null | undefined,
  ...fieldKeys: string[]
) {
  if (!fields) return false;
  const aliases = new Set(fieldKeys.map(normalizedFieldKey));
  return fields.some((candidate) => aliases.has(normalizedFieldKey(candidate.field_key)));
}

export const DEFAULT_CART_SETTINGS = {
  cardsPerRow: 2,
  visibleDetails: { image: true, productName: true, price: true, category: true, brand: true, model: true, variant: true, quantity: true, setCount: true, buttons: true },
};
export type CartSettings = typeof DEFAULT_CART_SETTINGS;

export function resolveCartDisplaySettings(
  cart: CartSettings,
  list: ProductListSettings,
  fields: DealerProductSchemaField[] | null,
  businessTypeId?: string | number | null,
  legacyFields: ProductFieldSettings = DEFAULT_PRODUCT_FIELD_SETTINGS,
  legacySections: ProductSectionSettings = DEFAULT_PRODUCT_SECTION_SETTINGS
): CartSettings {
  const schemaDriven = Number(businessTypeId) !== 1 && Number(businessTypeId) !== 2;
  const visible = (
    legacyValue: boolean,
    field: keyof ProductFieldSettings,
    section: keyof ProductSectionSettings,
    ...keys: string[]
  ) => {
    if (!schemaDriven) return legacyValue && isProductFieldVisible(legacyFields, field) && isProductSectionVisible(legacySections, section);
    return fields !== null && hasDealerSchemaField(fields, ...keys) && isDealerSchemaFieldVisible(fields, ...keys);
  };
  const visibleImage = schemaDriven
    ? visible(false, 'mainProductImage', 'imagesGallery', 'product_image', 'main_product_image', 'mainProductImage')
    : visible(cart.visibleDetails.image && list.productImage, 'mainProductImage', 'imagesGallery');
  return {
    ...cart,
    visibleDetails: {
      ...cart.visibleDetails,
      image: visibleImage,
      productName: visible(cart.visibleDetails.productName && list.productName, 'productName', 'productInformation', 'product_name', 'productName', 'name'),
      price: visible(cart.visibleDetails.price && list.rate, 'rateSetup', 'rateSetup', 'selling_price', 'price', 'rate'),
      category: visible(cart.visibleDetails.category && list.category, 'category', 'productInformation', 'category', 'stock_group'),
      brand: visible(true, 'brand', 'productInformation', 'brand'),
      model: visible(true, 'designNumber', 'productInformation', 'model', 'design_number'),
      variant: visible(true, 'availableSizes', 'sizesColors', 'size', 'weight_volume', 'packaging', 'dairy_type', 'flavor', 'color', 'colour'),
    },
  };
}

export function normalizeCartSettings(value: any): CartSettings {
  const visibleDetails = { ...DEFAULT_CART_SETTINGS.visibleDetails };
  for (const key of Object.keys(visibleDetails) as (keyof typeof visibleDetails)[]) {
    const incoming = value?.visibleDetails?.[key];
    if (incoming !== undefined && incoming !== null) visibleDetails[key] = ![false, 0, '0', 'false', 'off', 'no', ''].includes(typeof incoming === 'string' ? incoming.toLowerCase().trim() : incoming);
  }
  return { cardsPerRow: [1, 2, 3, 4].includes(Number(value?.cardsPerRow)) ? Number(value.cardsPerRow) : 2, visibleDetails };
}

// Caches are offline copies of the same dealer records, never mobile preferences.
export function useDealerDisplaySettings(dealerId?: string | number | null, businessTypeId?: string | number | null) {
  const identity = `${dealerId ?? ''}:${businessTypeId ?? ''}`;
  const [state, setState] = useState<{
    dealer: string;
    cart: CartSettings;
    list: ProductListSettings;
    fieldSettings: ProductFieldSettings;
    sectionSettings: ProductSectionSettings;
    schemaFields: DealerProductSchemaField[] | null;
  }>({ dealer: '', cart: DEFAULT_CART_SETTINGS, list: DEFAULT_PRODUCT_LIST_SETTINGS, fieldSettings: DEFAULT_PRODUCT_FIELD_SETTINGS, sectionSettings: DEFAULT_PRODUCT_SECTION_SETTINGS, schemaFields: null });
  useFocusEffect(useCallback(() => {
    if (!dealerId) return;
    let active = true;
    const dealer = String(dealerId);
    const settingsIdentity = `${dealer}:${businessTypeId ?? ''}`;
    const cacheKey = `dealer_display_settings_${settingsIdentity}`;
    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        const usesSchemaSettings = Number(businessTypeId) !== 1 && Number(businessTypeId) !== 2;
        if (active && cached) {
          const cachedState = JSON.parse(cached);
          setState({
            ...cachedState,
            dealer: settingsIdentity,
            // Revalidate the dealer schema before displaying schema-controlled
            // fields; stale cached ON values can otherwise survive a web change.
            schemaFields: usesSchemaSettings ? null : cachedState.schemaFields ?? null,
            list: usesSchemaSettings
              ? { ...cachedState.list, productImage: false }
              : cachedState.list,
          });
        }
        const [cartResult, listResult, schemaResult] = await Promise.allSettled([
          apiGet(`/cart-settings?dealerid=${encodeURIComponent(dealer)}`), loadProductSettings(dealer),
          businessTypeId ? apiGet(`/dealer-product-schema?dealer_id=${encodeURIComponent(dealer)}&business_type_id=${encodeURIComponent(String(businessTypeId))}&include_hidden=1`) : Promise.resolve(null),
        ]);
        if (!active) return;
        const previous = cached ? JSON.parse(cached) : {
          cart: DEFAULT_CART_SETTINGS,
          list: DEFAULT_PRODUCT_LIST_SETTINGS,
          fieldSettings: DEFAULT_PRODUCT_FIELD_SETTINGS,
          sectionSettings: DEFAULT_PRODUCT_SECTION_SETTINGS,
          schemaFields: null,
        };
        const schemaFields = schemaResult.status === 'fulfilled' && schemaResult.value
          ? (Array.isArray(schemaResult.value.schema) ? schemaResult.value.schema : []) as DealerProductSchemaField[]
          : usesSchemaSettings
            ? null
            : (previous.schemaFields as DealerProductSchemaField[] | null) ?? null;
        const legacySettings = listResult.status === 'fulfilled' ? listResult.value : null;
        const next = { dealer: settingsIdentity, schemaFields,
          cart: cartResult.status === 'fulfilled' ? normalizeCartSettings(cartResult.value.settings) : previous.cart,
          list: legacySettings?.listSettings ?? previous.list,
          fieldSettings: legacySettings?.fieldSettings ?? previous.fieldSettings ?? DEFAULT_PRODUCT_FIELD_SETTINGS,
          sectionSettings: legacySettings?.sectionSettings ?? previous.sectionSettings ?? DEFAULT_PRODUCT_SECTION_SETTINGS,
        };
        const imageFieldExists = schemaFields?.some((field) =>
          ['productimage', 'mainproductimage'].includes(normalizedFieldKey(field.field_key))
        ) ?? false;
        // Schema-driven modules use the dealer schema as their source of truth.
        // Treat an absent/unavailable media field as hidden so stale/default list
        // settings cannot render a placeholder while the schema is missing.
        const imageVisible = usesSchemaSettings
          ? schemaFields !== null && imageFieldExists && isDealerSchemaFieldVisible(
              schemaFields,
              'product_image',
              'main_product_image',
              'mainProductImage'
            )
          : isDealerSchemaFieldVisible(schemaFields, 'product_image', 'main_product_image', 'mainProductImage');
        if (__DEV__) {
          const imageField = schemaFields?.find((field) =>
            ['productimage', 'mainproductimage'].includes(normalizedFieldKey(field.field_key))
          );
          console.log('[DealerDisplaySettings] Product Image schema received', {
            dealerId: dealer,
            businessTypeId,
            schemaFieldCount: schemaFields?.length ?? null,
            fieldKey: imageField?.field_key ?? null,
            isVisible: imageField?.is_visible ?? null,
            isDeleted: imageField?.is_deleted ?? null,
            effectiveVisible: imageVisible,
            requestBaseUrl: apiUrl,
          });
        }
        next.list = {
          ...next.list,
          // Schema-driven modules follow the dealer schema; legacy list
          // preferences remain in force for Garment/Mobile.
          productImage: usesSchemaSettings ? imageVisible : next.list.productImage && imageVisible,
        };
        setState(next);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(next));
        for (const result of [cartResult, listResult, schemaResult]) {
          if (result.status === 'rejected' && __DEV__) {
            console.debug('[DealerDisplaySettings] Optional settings unavailable', {
              dealerId,
              message: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.debug('[DealerDisplaySettings] Optional settings load failed', {
            dealerId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => { active = false; };
  }, [dealerId, businessTypeId]));
  return state.dealer === identity
    ? state
    : { dealer: identity, cart: DEFAULT_CART_SETTINGS, list: { ...DEFAULT_PRODUCT_LIST_SETTINGS, productImage: false }, fieldSettings: DEFAULT_PRODUCT_FIELD_SETTINGS, sectionSettings: DEFAULT_PRODUCT_SECTION_SETTINGS, schemaFields: null };
}
