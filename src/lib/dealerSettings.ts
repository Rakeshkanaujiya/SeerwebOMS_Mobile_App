import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet } from './services/api';

export const PRODUCT_FIELD_KEYS = [
  'productName',
  'designNumber',
  'launchDate',
  'bookingType',
  'brand',
  'masterCategory',
  'category',
  'subCategory',
  'fabricType',
  'styleDesign',
  'hsnCode',
  'rackNumber',
  'fitType',
  'productDescription',
  'productTags',
  'barcodeSku',
  'mainProductImage',
  'galleryImages',
  'availableSizes',
  'availableColors',
  'sizeSetManagement',
  'rateSetup',
] as const;

export type ProductFieldKey = (typeof PRODUCT_FIELD_KEYS)[number];
export type ProductFieldSettings = Record<ProductFieldKey, boolean>;

export const PRODUCT_SECTION_KEYS = [
  'productInformation',
  'imagesGallery',
  'sizesColors',
  'colorVariantConfiguration',
  'sizeSetManagement',
  'rateSetup',
] as const;

export type ProductSectionKey = (typeof PRODUCT_SECTION_KEYS)[number];
export type ProductSectionSettings = Record<ProductSectionKey, boolean>;

export const PRODUCT_LIST_KEYS = [
  'selectCheckbox',
  'productImage',
  'productName',
  'designNumber',
  'status',
  'brand',
  'category',
  'subCategory',
  'styleDesign',
  'color',
  'size',
  'rate',
  'stock',
  'launchDate',
] as const;

export type ProductListColumnKey = (typeof PRODUCT_LIST_KEYS)[number];
export type ProductListSettings = Record<ProductListColumnKey, boolean>;

export const DEFAULT_PRODUCT_FIELD_SETTINGS = PRODUCT_FIELD_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {} as ProductFieldSettings);

export const DEFAULT_PRODUCT_SECTION_SETTINGS = PRODUCT_SECTION_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {} as ProductSectionSettings);

export const DEFAULT_PRODUCT_LIST_SETTINGS = PRODUCT_LIST_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {} as ProductListSettings);

function normalizeBooleanSettings<T extends string>(
  keys: readonly T[],
  defaults: Record<T, boolean>,
  value: unknown
): Record<T, boolean> {
  const incoming = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return keys.reduce((acc, key) => {
    const value = incoming[key];
    if (value === undefined || value === null) {
      acc[key] = defaults[key];
    } else if (typeof value === 'boolean') {
      acc[key] = value;
    } else if (typeof value === 'number') {
      acc[key] = value !== 0;
    } else if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      acc[key] = !['false', '0', 'no', 'off', ''].includes(normalized);
    } else {
      acc[key] = Boolean(value);
    }
    return acc;
  }, {} as Record<T, boolean>);
}

export function normalizeProductFieldSettings(value: unknown): ProductFieldSettings {
  return normalizeBooleanSettings(
    PRODUCT_FIELD_KEYS,
    DEFAULT_PRODUCT_FIELD_SETTINGS,
    value
  ) as ProductFieldSettings;
}

export function normalizeProductSectionSettings(value: unknown): ProductSectionSettings {
  return normalizeBooleanSettings(
    PRODUCT_SECTION_KEYS,
    DEFAULT_PRODUCT_SECTION_SETTINGS,
    value
  ) as ProductSectionSettings;
}

export function normalizeProductListSettings(value: unknown): ProductListSettings {
  return normalizeBooleanSettings(
    PRODUCT_LIST_KEYS,
    DEFAULT_PRODUCT_LIST_SETTINGS,
    value
  ) as ProductListSettings;
}

async function fetchJson(endpoint: string, token?: string | null) {
  return apiGet(endpoint, token ?? undefined);
}

async function fetchSettings(endpoint: string, token?: string | null) {
  const data = await fetchJson(endpoint, token);
  return data?.settings ?? data;
}

export async function loadProductFieldSettings(
  dealerId: string | number,
  token?: string | null
): Promise<ProductFieldSettings> {
  const cacheKey = `product_field_settings_${dealerId}`;
  try {
    const settings = normalizeProductFieldSettings(
      await fetchSettings(`/product-field-settings?dealerid=${encodeURIComponent(String(dealerId))}`, token)
    );
    await AsyncStorage.setItem(cacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return normalizeProductFieldSettings(JSON.parse(cached));
    throw error;
  }
}

export async function loadProductSectionSettings(
  dealerId: string | number,
  token?: string | null
): Promise<ProductSectionSettings> {
  const cacheKey = `product_section_settings_${dealerId}`;
  try {
    const data = await fetchJson(`/product-settings?dealerid=${encodeURIComponent(String(dealerId))}`, token);
    const settings = normalizeProductSectionSettings(data?.section_settings ?? data?.settings?.sections);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return normalizeProductSectionSettings(JSON.parse(cached));
    throw error;
  }
}

export async function loadProductSettings(
  dealerId: string | number,
  token?: string | null
): Promise<{
  sectionSettings: ProductSectionSettings;
  fieldSettings: ProductFieldSettings;
  listSettings: ProductListSettings;
}> {
  const sectionCacheKey = `product_section_settings_${dealerId}`;
  const fieldCacheKey = `product_field_settings_${dealerId}`;
  const listCacheKey = `product_list_settings_${dealerId}`;
  try {
    const data = await fetchJson(`/product-settings?dealerid=${encodeURIComponent(String(dealerId))}`, token);
    const sectionSettings = normalizeProductSectionSettings(data?.section_settings ?? data?.settings?.sections);
    const fieldSettings = normalizeProductFieldSettings(data?.field_settings ?? data?.settings?.fields);
    const listSettings = normalizeProductListSettings(data?.list_settings ?? data?.settings?.list);
    await Promise.all([
      AsyncStorage.setItem(sectionCacheKey, JSON.stringify(sectionSettings)),
      AsyncStorage.setItem(fieldCacheKey, JSON.stringify(fieldSettings)),
      AsyncStorage.setItem(listCacheKey, JSON.stringify(listSettings)),
    ]);
    return { sectionSettings, fieldSettings, listSettings };
  } catch (error) {
    try {
      const [fieldSettings, listSettings] = await Promise.all([
        loadProductFieldSettings(dealerId, token),
        loadProductListSettings(dealerId, token).catch(() => DEFAULT_PRODUCT_LIST_SETTINGS),
      ]);
      const cachedSections = await AsyncStorage.getItem(sectionCacheKey);
      const sectionSettings = cachedSections
        ? normalizeProductSectionSettings(JSON.parse(cachedSections))
        : { ...DEFAULT_PRODUCT_SECTION_SETTINGS };
      await Promise.all([
        AsyncStorage.setItem(sectionCacheKey, JSON.stringify(sectionSettings)),
        AsyncStorage.setItem(fieldCacheKey, JSON.stringify(fieldSettings)),
        AsyncStorage.setItem(listCacheKey, JSON.stringify(listSettings)),
      ]);
      return { sectionSettings, fieldSettings, listSettings };
    } catch {
      const [cachedSections, cachedFields, cachedList] = await Promise.all([
        AsyncStorage.getItem(sectionCacheKey),
        AsyncStorage.getItem(fieldCacheKey),
        AsyncStorage.getItem(listCacheKey),
      ]);
      if (cachedSections || cachedFields || cachedList) {
        return {
          sectionSettings: cachedSections
            ? normalizeProductSectionSettings(JSON.parse(cachedSections))
            : { ...DEFAULT_PRODUCT_SECTION_SETTINGS },
          fieldSettings: cachedFields
            ? normalizeProductFieldSettings(JSON.parse(cachedFields))
            : { ...DEFAULT_PRODUCT_FIELD_SETTINGS },
          listSettings: cachedList
            ? normalizeProductListSettings(JSON.parse(cachedList))
            : { ...DEFAULT_PRODUCT_LIST_SETTINGS },
        };
      }
      throw error;
    }
  }
}

export async function getCachedProductSettings(dealerId: string | number): Promise<{
  sectionSettings: ProductSectionSettings;
  fieldSettings: ProductFieldSettings;
  listSettings: ProductListSettings;
} | null> {
  const sectionCacheKey = `product_section_settings_${dealerId}`;
  const fieldCacheKey = `product_field_settings_${dealerId}`;
  const listCacheKey = `product_list_settings_${dealerId}`;
  const [cachedSections, cachedFields, cachedList] = await Promise.all([
    AsyncStorage.getItem(sectionCacheKey),
    AsyncStorage.getItem(fieldCacheKey),
    AsyncStorage.getItem(listCacheKey),
  ]);

  if (!cachedSections && !cachedFields && !cachedList) return null;

  return {
    sectionSettings: cachedSections
      ? normalizeProductSectionSettings(JSON.parse(cachedSections))
      : { ...DEFAULT_PRODUCT_SECTION_SETTINGS },
    fieldSettings: cachedFields
      ? normalizeProductFieldSettings(JSON.parse(cachedFields))
      : { ...DEFAULT_PRODUCT_FIELD_SETTINGS },
    listSettings: cachedList
      ? normalizeProductListSettings(JSON.parse(cachedList))
      : { ...DEFAULT_PRODUCT_LIST_SETTINGS },
  };
}

export async function loadProductListSettings(
  dealerId: string | number,
  token?: string | null
): Promise<ProductListSettings> {
  const cacheKey = `product_list_settings_${dealerId}`;
  try {
    const settings = normalizeProductListSettings(
      await fetchSettings(`/product-list-settings?dealerid=${encodeURIComponent(String(dealerId))}`, token)
    );
    await AsyncStorage.setItem(cacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return normalizeProductListSettings(JSON.parse(cached));
    throw error;
  }
}

export function isProductFieldVisible(settings: ProductFieldSettings, key: ProductFieldKey) {
  return settings[key] !== false;
}

export function isProductSectionVisible(settings: ProductSectionSettings, key: ProductSectionKey) {
  return settings[key] !== false;
}

export function isProductListColumnVisible(settings: ProductListSettings, key: ProductListColumnKey) {
  return settings[key] !== false;
}
