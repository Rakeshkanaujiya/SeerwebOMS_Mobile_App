import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveCartDisplaySettings, useDealerDisplaySettings } from '../../src/lib/cartSettings';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiUrl } from 'apiurl';
import CustomAlert from 'components/CustomAlert';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import Navbar from 'components/Navbar';
import ScreenSkeleton from 'components/ScreenSkeleton';
import type { CreateItemMasterScreenProps } from '../../types/navigation';
import { hydrateStaffPermissions, refreshAuthenticatedUser } from '../../src/lib/auth';
import {
  canManageProductsForUser,
  getProductDealerId,
} from '../../src/lib/permissions';
import { invalidateCaches } from '../../src/lib/cache';
import { cachedImageSource } from '../../src/lib/images';
import { OMS_COLORS } from '../../src/lib/theme';
import {
  DEFAULT_PRODUCT_FIELD_SETTINGS,
  DEFAULT_PRODUCT_SECTION_SETTINGS,
  getCachedProductSettings,
  isProductFieldVisible,
  isProductSectionVisible,
  loadProductSettings,
  ProductFieldKey,
  ProductFieldSettings,
  ProductSectionKey,
  ProductSectionSettings,
} from '../../src/lib/dealerSettings';

type GarmentForm = {
  productName: string;
  designNumber: string;
  launchDate: string;
  bookingType: string;
  brand: string;
  masterCategory: string;
  category: string;
  subCategory: string;
  fabricType: string;
  styleDesign: string;
  hsnCode: string;
  productDescription: string;
  productTags: string;
  rackNumber: string;
  barcodeSku: string;
  fitType: string;
  trendingProduct: boolean;
  newArrival: boolean;
};

type PickedImage = {
  id: string;
  uri: string;
  name?: string;
  type?: string;
  existing?: boolean;
  rawPath?: string;
};

type ImagePickerSource = 'camera' | 'gallery';

type ImagePickerRequest = {
  allowsMultipleSelection: boolean;
  onPicked: (images: PickedImage[]) => void;
};

type ColorVariant = {
  id: string;
  color: string;
  hex: string;
  image?: PickedImage | null;
  rawImage?: string;
  sku: string;
  designNumber: string;
};

type SizeSet = {
  id: string;
  name: string;
  sizeSystemKey: string;
  sizes: string[];
};

type VariantRow = {
  id: string;
  size: string;
  qty: string;
  mrp: string;
  rate: string;
  rack: string;
};

type AttributeField = {
  id: number;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'select' | 'number' | 'multiselect' | 'checkbox' | 'textarea' | 'date' | 'image';
  field_options: string | null;
  is_required: number;
  sort_order: number;
};

const EMPTY_FORM: GarmentForm = {
  productName: '',
  designNumber: '',
  launchDate: '',
  bookingType: '',
  brand: '',
  masterCategory: '',
  category: '',
  subCategory: '',
  fabricType: '',
  styleDesign: '',
  hsnCode: '',
  productDescription: '',
  productTags: '',
  rackNumber: '',
  barcodeSku: '',
  fitType: '',
  trendingProduct: false,
  newArrival: false,
};

const DEFAULT_COLORS = [
  { name: 'White', hex: '#f8fafc' },
  { name: 'Navy', hex: '#1e3a8a' },
  { name: 'Bottle Green', hex: '#0f5132' },
  { name: 'Olive', hex: '#708238' },
  { name: 'Mustard', hex: '#d6a21f' },
  { name: 'Black', hex: '#111827' },
];

const SIZE_SYSTEMS = [
  { key: 'alpha', label: 'Alpha Sizes', options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'] },
  { key: 'numeric', label: 'Numeric Sizes', options: ['28', '30', '32', '34', '36', '38', '40', '42', '44'] },
  { key: 'kids', label: 'Kids Sizes', options: ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y'] },
  { key: 'free', label: 'Free Size', options: ['FREE'] },
];

const DEFAULT_SIZE_SET: SizeSet = {
  id: 'default-alpha-xs-2xl',
  name: 'XS-2XL',
  sizeSystemKey: 'alpha',
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const cleanText = (value: unknown) => String(value ?? '').trim();
const cleanNumber = (value: string) => value.replace(/[^0-9.]/g, '');
const titleCase = (value: string) => value.replace(/\b\w/g, (char) => char.toUpperCase());

function parseAttributes(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? (value as Record<string, any>) : {};
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const DUPLICATE_DESIGN_NUMBER_MESSAGE = 'A product with this Design Number already exists.';

const normalizeDesignNumber = (value: unknown) => cleanText(value).toUpperCase();

const getProductDesignNumber = (product: any) => {
  const attributes = parseAttributes(product?.attributes);
  return normalizeDesignNumber(
    product?.design_number ||
    attributes.design_number ||
    attributes.designNumber ||
    attributes.design ||
    product?.model
  );
};

async function ensureUniqueDesignNumber(
  dealerId: string,
  token: string,
  designNumber: string,
  currentProductId?: string | number
) {
  const target = normalizeDesignNumber(designNumber);
  if (!target) return;

  const response = await fetch(`${apiUrl}/products?dealerid=${dealerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return;

  const result = await parseJsonResponse(response);
  if (!Array.isArray(result)) return;

  const duplicate = result.some((product: any) => {
    if (currentProductId !== undefined && String(product?.id) === String(currentProductId)) {
      return false;
    }
    return getProductDesignNumber(product) === target;
  });

  if (duplicate) {
    throw new Error(DUPLICATE_DESIGN_NUMBER_MESSAGE);
  }
}

function imageName(uri: string, fallback: string) {
  const last = uri.split('/').pop() || fallback;
  return last.includes('.') ? last : `${last}.jpg`;
}

function inferMime(uri: string, fallback = 'image/jpeg') {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return fallback;
}

function appendImage(formData: FormData, key: string, image?: PickedImage | null) {
  if (!image || image.existing) return;
  formData.append(key, {
    uri: image.uri,
    name: image.name || imageName(image.uri, `${key}.jpg`),
    type: image.type || inferMime(image.uri),
  } as any);
}

function getImageUrl(path: string) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('file:')) return path;
  return `${apiUrl.replace(/\/api\/?$/i, '')}/${path.replace(/^\/+/, '')}`;
}

function defaultHex(color: string) {
  return DEFAULT_COLORS.find((item) => item.name.toLowerCase() === color.toLowerCase())?.hex || '#d1d5db';
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseFieldOptions(field?: AttributeField | null): string[] {
  if (!field?.field_options) return [];
  try {
    const parsed = JSON.parse(field.field_options);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseMultiValue(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={18} color={OMS_COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType = 'default',
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  error?: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.textArea, error && styles.inputError]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export default function CreateItemMasterScreen({
  navigation,
  route,
}: CreateItemMasterScreenProps) {
  const editProduct = route.params?.product;
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState('');
  const [form, setForm] = useState<GarmentForm>(EMPTY_FORM);
  const [showInCreateOrder, setShowInCreateOrder] = useState(true);
  const [mainImage, setMainImage] = useState<PickedImage | null>(null);
  const [galleryImages, setGalleryImages] = useState<PickedImage[]>([]);
  const [imagePickerRequest, setImagePickerRequest] = useState<ImagePickerRequest | null>(null);
  const [selectedColorInput, setSelectedColorInput] = useState('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
  const [selectedSizeSystem, setSelectedSizeSystem] = useState(SIZE_SYSTEMS[0].key);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState('');
  const [sizeSets, setSizeSets] = useState<SizeSet[]>([DEFAULT_SIZE_SET]);
  const [activeSizeSetIds, setActiveSizeSetIds] = useState<string[]>([]);
  const [sizeSetName, setSizeSetName] = useState('');
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [booting, setBooting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [designNumberError, setDesignNumberError] = useState('');
  const [fieldSettings, setFieldSettings] = useState<ProductFieldSettings>(
    DEFAULT_PRODUCT_FIELD_SETTINGS
  );
  const [sectionSettings, setSectionSettings] = useState<ProductSectionSettings>(
    DEFAULT_PRODUCT_SECTION_SETTINGS
  );
  const [dynamicSchema, setDynamicSchema] = useState<AttributeField[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});

  const dealerId = useMemo(() => getProductDealerId(user), [user]);
  const display = useDealerDisplaySettings(dealerId, user?.business_type_id);
  const imageVisible = resolveCartDisplaySettings(display.cart, display.list, display.schemaFields, user?.business_type_id, display.fieldSettings, display.sectionSettings).visibleDetails.image;
  const schemaKeys = useMemo(() => new Set(dynamicSchema.map((field) => field.field_key)), [dynamicSchema]);
  const hasDealerSchema = dynamicSchema.length > 0;
  const isGarmentBusiness = Number(user?.business_type_id) === 2;
  const schemaHas = useCallback(
    (...keys: string[]) => keys.some((key) => schemaKeys.has(key)),
    [schemaKeys]
  );
  const isFieldVisible = useCallback(
    (key: ProductFieldKey) => {
      if (!hasDealerSchema || isGarmentBusiness) {
        return isProductFieldVisible(fieldSettings, key);
      }

      const schemaFieldMap: Partial<Record<ProductFieldKey, string[]>> = {
        productName: ['product_name', 'productName'],
        brand: ['brand'],
        category: ['category'],
        productDescription: ['description', 'product_description'],
        barcodeSku: ['sku', 'barcode', 'barcode_sku'],
        mainProductImage: ['product_image', 'mainProductImage'],
        galleryImages: ['gallery_images'],
        availableSizes: ['size'],
        availableColors: ['color', 'available_colors'],
        rateSetup: ['size', 'selling_price', 'mrp', 'stock'],
      };

      const schemaKeysForField = schemaFieldMap[key];
      return schemaKeysForField ? schemaHas(...schemaKeysForField) : false;
    },
    [fieldSettings, hasDealerSchema, isGarmentBusiness, schemaHas]
  );
  const productNameField = dynamicSchema.find((field) => ['product_name', 'productName'].includes(field.field_key));
  const productNameRequired = productNameField
    ? Number(productNameField.is_required) === 1
    : isFieldVisible('productName');
  const isSectionVisible = useCallback(
    (key: ProductSectionKey) => isProductSectionVisible(sectionSettings, key),
    [sectionSettings]
  );
  const canManageProducts = useMemo(() => canManageProductsForUser(user), [user]);
  const isEditing = Boolean(editProduct?.id);
  const sizeSystem = SIZE_SYSTEMS.find((item) => item.key === selectedSizeSystem) || SIZE_SYSTEMS[0];
  const dynamicSizeOptions = parseFieldOptions(dynamicSchema.find((field) => field.field_key === 'size'));
  const variantFieldLabel = hasDealerSchema && !isGarmentBusiness
    ? dynamicSchema.find((field) => field.field_key === 'size')?.field_label || 'Variant'
    : 'Size';
  const sizeOptions = dynamicSizeOptions.length > 0 ? dynamicSizeOptions : sizeSystem.options;
  const currentSizeSets = useMemo(
    () => sizeSets.filter((item) => item.sizeSystemKey === selectedSizeSystem),
    [selectedSizeSystem, sizeSets]
  );
  const effectiveSizes = useMemo(
    () =>
      uniqueValues([
        ...selectedSizes,
        ...activeSizeSetIds.flatMap(
          (id) => currentSizeSets.find((item) => item.id === id)?.sizes || []
        ),
      ]),
    [activeSizeSetIds, currentSizeSets, selectedSizes]
  );
  const totalPieces = useMemo(
    () => variants.reduce((sum, variant) => sum + Number(variant.qty || 0), 0),
    [variants]
  );
  const productInfoFieldKeys: ProductFieldKey[] = [
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
  ];
  const showProductInformation = isSectionVisible('productInformation') && productInfoFieldKeys.some(isFieldVisible);
  const showImagesGallery = imageVisible && isSectionVisible('imagesGallery') && (isFieldVisible('mainProductImage') || isFieldVisible('galleryImages'));
  const showSizesColors = isSectionVisible('sizesColors') && (isFieldVisible('availableColors') || isFieldVisible('availableSizes'));
  const showColorVariantConfiguration = isSectionVisible('colorVariantConfiguration') && isFieldVisible('availableColors');
  const showSizeSetManagement = isSectionVisible('sizeSetManagement') && isFieldVisible('sizeSetManagement');
  const showRateSetup = isSectionVisible('rateSetup') && isFieldVisible('rateSetup');
  const dynamicFormFields = useMemo(
    () =>
      dynamicSchema.filter(
        (field) =>
          ![
            'product_name',
            'productName',
            'product_image',
            'description',
            'brand',
            'category',
            'size',
            'mrp',
          ].includes(field.field_key)
      ),
    [dynamicSchema]
  );

  const showAlert = useCallback((message: string) => {
    setAlertMsg(message);
    setAlertVisible(true);
  }, []);

  const setField = useCallback(<K extends keyof GarmentForm>(field: K, value: GarmentForm[K]) => {
    if (field === 'designNumber') {
      setDesignNumberError('');
    }
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  const setDynamicValue = useCallback((key: string, value: string) => {
    setDynamicValues((current) => ({ ...current, [key]: value }));
  }, []);

  const toggleDynamicMultiValue = useCallback((key: string, option: string) => {
    setDynamicValues((current) => {
      const selected = parseMultiValue(current[key] ?? '');
      const next = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option];
      return { ...current, [key]: JSON.stringify(next) };
    });
  }, []);

  const mapPickedAssets = useCallback((assets: ImagePicker.ImagePickerAsset[]) =>
    assets.map((asset, index) => ({
      id: makeId(),
      uri: asset.uri,
      name: asset.fileName || imageName(asset.uri, `product-${index}.jpg`),
      type: asset.mimeType || inferMime(asset.uri),
    })), []);

  const openImagePickerSheet = useCallback(
    (allowsMultipleSelection: boolean, onPicked: (images: PickedImage[]) => void) => {
      setImagePickerRequest({ allowsMultipleSelection, onPicked });
    },
    []
  );

  const closeImagePickerSheet = useCallback(() => {
    setImagePickerRequest(null);
  }, []);

  const launchImagePicker = useCallback(
    async (source: ImagePickerSource) => {
      const request = imagePickerRequest;
      if (!request) return;
      setImagePickerRequest(null);

      try {
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            showAlert('Camera permission is required to take a photo.');
            return;
          }

          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.72,
            exif: false,
            base64: false,
          });

          if (!result.canceled) {
            request.onPicked(mapPickedAssets(result.assets).slice(0, 1));
          }
          return;
        }

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showAlert('Photo library permission is required to choose images.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: request.allowsMultipleSelection,
          quality: 0.72,
          exif: false,
          base64: false,
        });

        if (!result.canceled) {
          request.onPicked(mapPickedAssets(result.assets));
        }
      } catch {
        showAlert('Unable to open image picker. Please try again.');
      }
    },
    [imagePickerRequest, mapPickedAssets, showAlert]
  );

  const addColor = useCallback((rawColor: string) => {
    const color = titleCase(rawColor.trim());
    if (!color || selectedColors.some((item) => item.toLowerCase() === color.toLowerCase())) {
      setSelectedColorInput('');
      return;
    }

    setSelectedColors((current) => [...current, color]);
    setColorVariants((current) => [
      ...current,
      {
        id: makeId(),
        color,
        hex: defaultHex(color),
        image: null,
        sku: form.barcodeSku,
        designNumber: form.designNumber,
      },
    ]);
    setSelectedColorInput('');
  }, [form.barcodeSku, form.designNumber, selectedColors]);

  const removeColor = useCallback((color: string) => {
    setSelectedColors((current) => current.filter((item) => item !== color));
    setColorVariants((current) => current.filter((item) => item.color !== color));
  }, []);

  const toggleSize = useCallback((size: string) => {
    setActiveSizeSetIds([]);
    setSelectedSizes((current) =>
      current.includes(size) ? current.filter((item) => item !== size) : [...current, size]
    );
  }, []);

  const toggleSizeSet = useCallback((sizeSet: SizeSet) => {
    setSelectedSizes([]);
    setActiveSizeSetIds((current) =>
      current.includes(sizeSet.id)
        ? current.filter((item) => item !== sizeSet.id)
        : [...current, sizeSet.id]
    );
  }, []);

  const saveSizeSet = useCallback(() => {
    const name = sizeSetName.trim();
    if (!name) {
      showAlert('Enter a size set name.');
      return;
    }
    if (effectiveSizes.length === 0) {
      showAlert('Select at least one size before saving a size set.');
      return;
    }
    const next: SizeSet = {
      id: makeId(),
      name,
      sizeSystemKey: selectedSizeSystem,
      sizes: effectiveSizes,
    };
    setSizeSets((current) => [...current, next]);
    setSelectedSizes([]);
    setActiveSizeSetIds([next.id]);
    setSizeSetName('');
  }, [effectiveSizes, selectedSizeSystem, showAlert, sizeSetName]);

  const updateVariant = useCallback((id: string, field: keyof VariantRow, value: string) => {
    setVariants((current) =>
      current.map((variant) => (variant.id === id ? { ...variant, [field]: value } : variant))
    );
  }, []);

  const updateColorVariant = useCallback(
    (id: string, patch: Partial<ColorVariant>) => {
      setColorVariants((current) =>
        current.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant))
      );
    },
    []
  );

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        const [storedUser, storedToken] = await Promise.all([
          AsyncStorage.getItem('user'),
          AsyncStorage.getItem('token'),
        ]);

        if (!storedUser || !storedToken) {
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }

        const parsedUser = JSON.parse(storedUser);
        let activeUser = parsedUser;

        if (!canManageProductsForUser(activeUser) && activeUser.role === 'staff') {
          activeUser = await hydrateStaffPermissions(parsedUser, storedToken);
          await AsyncStorage.setItem('user', JSON.stringify(activeUser));
        }

        if (!active) return;
        setUser(activeUser);
        setToken(storedToken);

        if (!canManageProductsForUser(activeUser)) {
          showAlert('You do not have permission to create or edit products.');
          setTimeout(() => navigation.goBack(), 650);
          setBooting(false);
          return;
        } else {
          const activeDealerId = getProductDealerId(activeUser);
          if (activeDealerId) {
            const cachedSettings = await getCachedProductSettings(activeDealerId).catch(() => null);
            if (active && cachedSettings) {
              setFieldSettings(cachedSettings.fieldSettings);
              setSectionSettings(cachedSettings.sectionSettings);
            }

            const schemaResponse = await fetch(
              `${apiUrl}/dealers/business-types/schema/${activeUser.business_type_id ?? 2}?dealer_id=${encodeURIComponent(String(activeDealerId))}`,
              { headers: { Authorization: `Bearer ${storedToken}` } }
            ).catch(() => null);
            if (active && schemaResponse?.ok) {
              const schema = await parseJsonResponse(schemaResponse);
              const rows = Array.isArray(schema) ? schema : [];
              setDynamicSchema(rows);
              setDynamicValues((current) => {
                const next = { ...current };
                rows.forEach((field: AttributeField) => {
                  if (!(field.field_key in next)) next[field.field_key] = '';
                });
                return next;
              });
            }
          }
        }

        setBooting(false);

        void (async () => {
          try {
            const freshUser = await refreshAuthenticatedUser(storedToken, activeUser);
            if (!active) return;
            setUser(freshUser);

            const activeDealerId = getProductDealerId(freshUser);
            if (!activeDealerId) return;

            const settings = await loadProductSettings(activeDealerId, storedToken).catch(
              () => ({
                fieldSettings: DEFAULT_PRODUCT_FIELD_SETTINGS,
                sectionSettings: DEFAULT_PRODUCT_SECTION_SETTINGS,
              })
            );
            if (!active) return;
            setFieldSettings(settings.fieldSettings);
            setSectionSettings(settings.sectionSettings);
          } catch (error) {
            if (__DEV__) console.warn('Failed to refresh create-item profile/settings:', error);
          }
        })();
      } catch {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    };

    void boot();

    return () => {
      active = false;
    };
  }, [navigation, showAlert]);

  useEffect(() => {
    if (!editProduct) return;

    const productAny = editProduct as any;
    const attributes = parseAttributes(editProduct.attributes);
    const savedColors = Array.isArray(attributes.color_variants)
      ? attributes.color_variants.map((entry: any) => cleanText(entry.color)).filter(Boolean)
      : Array.isArray(attributes.available_colors)
        ? attributes.available_colors.map(String)
        : cleanText(editProduct.color).split(',').map((item) => item.trim()).filter(Boolean);
    const savedSizeSets = Array.isArray(productAny.size_sets)
      ? productAny.size_sets
      : Array.isArray(attributes.selected_size_sets)
        ? attributes.selected_size_sets
        : [];
    const normalizedSizeSets: SizeSet[] = savedSizeSets
      .map((entry: any) => ({
        id: cleanText(entry.id) || makeId(),
        name: cleanText(entry.name),
        sizeSystemKey: cleanText(entry.sizeSystemKey || entry.size_system_key || 'alpha'),
        sizes: Array.isArray(entry.sizes) ? uniqueValues(entry.sizes.map(String)) : [],
      }))
      .filter((entry: SizeSet) => entry.name && entry.sizes.length > 0);
    const editVariants = Array.isArray(editProduct.variants) ? editProduct.variants : [];
    const variantSizes = uniqueValues(editVariants.map((variant: any) => cleanText(variant.size)));

    setForm({
      productName: cleanText(editProduct.name),
      designNumber: cleanText(attributes.design_number || editProduct.model),
      launchDate: cleanText(attributes.launch_date),
      bookingType: cleanText(attributes.booking_type),
      brand: cleanText(attributes.brand || editProduct.brand),
      masterCategory: cleanText(attributes.master_category),
      category: cleanText(attributes.category),
      subCategory: cleanText(attributes.sub_category),
      fabricType: cleanText(attributes.fabric_type),
      styleDesign: cleanText(attributes.style_design || attributes.design),
      hsnCode: cleanText(attributes.hsn_code || attributes.custom_hsn_code),
      productDescription: cleanText(editProduct.description || attributes.product_description),
      productTags: Array.isArray(attributes.product_tags) ? attributes.product_tags.join(', ') : '',
      rackNumber: cleanText(attributes.rack_number),
      barcodeSku: cleanText(attributes.barcode_sku || attributes.sku),
      fitType: cleanText(attributes.fit_type),
      trendingProduct: cleanText(attributes.trending_product).toLowerCase() === 'yes' || attributes.trending_product === true,
      newArrival: cleanText(attributes.new_arrival).toLowerCase() === 'yes' || attributes.new_arrival === true,
    });
    setDynamicValues((current) => {
      const next = { ...current };
      Object.entries(attributes).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          next[key] = JSON.stringify(value);
        } else if (typeof value === 'boolean') {
          next[key] = value ? '1' : '0';
        } else if (value !== null && value !== undefined) {
          next[key] = String(value);
        }
      });
      return next;
    });
    setShowInCreateOrder(
      productAny.show_in_create_order === true ||
      productAny.show_in_create_order === 1 ||
      productAny.show_in_create_order === '1'
    );
    if (editProduct.image) {
      setMainImage({
        id: makeId(),
        uri: getImageUrl(editProduct.image),
        existing: true,
        rawPath: editProduct.image,
      });
    }
    setGalleryImages(
      Array.isArray(attributes.gallery_images)
        ? attributes.gallery_images.map((path: string) => ({
            id: makeId(),
            uri: getImageUrl(path),
            existing: true,
            rawPath: path,
          }))
        : []
    );
    setSelectedColors(savedColors);
    setColorVariants(
      savedColors.map((color: string) => {
        const saved = Array.isArray(attributes.color_variants)
          ? attributes.color_variants.find(
              (entry: any) => cleanText(entry.color).toLowerCase() === color.toLowerCase()
            )
          : null;
        const rawImage = cleanText(saved?.image);
        return {
          id: makeId(),
          color,
          hex: cleanText(saved?.hex) || defaultHex(color),
          image: rawImage
            ? { id: makeId(), uri: getImageUrl(rawImage), existing: true, rawPath: rawImage }
            : null,
          rawImage,
          sku: cleanText(saved?.sku || attributes.barcode_sku),
          designNumber: cleanText(saved?.design_number || attributes.design_number),
        };
      })
    );
    if (normalizedSizeSets.length > 0) {
      setSizeSets((current) => [...current, ...normalizedSizeSets]);
      setSelectedSizeSystem(normalizedSizeSets[0].sizeSystemKey);
      setActiveSizeSetIds(normalizedSizeSets.map((entry) => entry.id));
      setSelectedSizes([]);
    } else {
      setSelectedSizes(variantSizes);
    }
    setVariants(
      editVariants.length > 0
        ? editVariants.map((variant: any) => ({
            id: makeId(),
            size: cleanText(variant.size),
            qty: cleanText(variant.qty || '1'),
            mrp: cleanText(variant.mrp),
            rate: cleanText(variant.rate || editProduct.price),
            rack: cleanText(variant.rack || attributes.rack_number),
          }))
        : []
    );
  }, [editProduct]);

  useEffect(() => {
    const defaults = variants[0] || { qty: '1', mrp: '', rate: '', rack: form.rackNumber };
    const sizes = effectiveSizes.length > 0 ? effectiveSizes : variants.length > 0 ? variants.map((item) => item.size) : [];
    if (sizes.length === 0) {
      setVariants([{ id: makeId(), size: '', qty: '1', mrp: '', rate: '', rack: form.rackNumber }]);
      return;
    }
    setVariants((current) =>
      sizes.map((size) => {
        const existing = current.find((variant) => variant.size === size);
        return existing || {
          id: makeId(),
          size,
          qty: defaults.qty || '1',
          mrp: defaults.mrp || '',
          rate: defaults.rate || '',
          rack: defaults.rack || form.rackNumber,
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSizes.join('|')]);

  const saveItem = useCallback(async () => {
    if (saving) return;
    if (!token || !dealerId || !canManageProducts) {
      showAlert('You do not have permission to create or edit products.');
      return;
    }
    if (productNameRequired && !cleanText(form.productName)) {
      showAlert('Enter a product name.');
      return;
    }
    const missingRequiredField = dynamicSchema.find((field) => {
      if (Number(field.is_required) !== 1) return false;
      if (['product_name', 'productName'].includes(field.field_key)) return !cleanText(form.productName);
      const value = dynamicValues[field.field_key] ?? '';
      if (field.field_type === 'checkbox') return value !== '1' && value !== 'true';
      if (field.field_type === 'multiselect') return parseMultiValue(value).length === 0;
      return cleanText(value) === '';
    });
    if (missingRequiredField) {
      showAlert(`${missingRequiredField.field_label} is required.`);
      return;
    }

    setSaving(true);
    try {
      setDesignNumberError('');
      await ensureUniqueDesignNumber(
        String(dealerId),
        token,
        form.designNumber,
        isEditing ? editProduct?.id : undefined
      );

      const selectedSizeSetsForSave = activeSizeSetIds
        .map((id) => currentSizeSets.find((item) => item.id === id))
        .filter((item): item is SizeSet => Boolean(item))
        .map((item) => ({
          id: item.id,
          name: item.name,
          sizeSystemKey: item.sizeSystemKey,
          sizes: item.sizes,
        }));
      const configuredColorVariants = colorVariants
        .filter((variant) => selectedColors.includes(variant.color))
        .map((variant) => ({
          color: variant.color,
          hex: variant.hex,
          image: variant.rawImage || '',
          sku: variant.sku.trim(),
          design_number: variant.designNumber.trim(),
        }));
      const dynamicAttributes = dynamicSchema.reduce<Record<string, any>>((acc, field) => {
        if (['product_name', 'productName', 'product_image', 'size'].includes(field.field_key)) return acc;
        const value = dynamicValues[field.field_key] ?? '';
        if (field.field_type === 'checkbox') {
          acc[field.field_key] = value === '1' || value === 'true';
        } else if (field.field_type === 'multiselect') {
          acc[field.field_key] = parseMultiValue(value);
        } else {
          acc[field.field_key] = value;
        }
        return acc;
      }, {});
      const attributes = {
        ...dynamicAttributes,
        brand: form.brand,
        design_number: form.designNumber,
        booking_type: form.bookingType,
        launch_date: form.launchDate,
        master_category: form.masterCategory,
        category: form.category,
        sub_category: form.subCategory,
        fabric_type: form.fabricType,
        style_design: form.styleDesign,
        hsn_code: form.hsnCode,
        product_description: form.productDescription,
        product_tags: form.productTags.split(',').map((item) => item.trim()).filter(Boolean),
        trending_product: form.trendingProduct ? 'Yes' : 'No',
        new_arrival: form.newArrival ? 'Yes' : 'No',
        rack_number: form.rackNumber,
        barcode_sku: form.barcodeSku,
        fit_type: form.fitType,
        available_colors: selectedColors,
        color_variants: configuredColorVariants,
        selected_size_sets: selectedSizeSetsForSave,
      };
      const variantsPayload = variants
        .filter((variant) =>
          [variant.size, variant.qty, variant.mrp, variant.rate, variant.rack].some(
            (value) => cleanText(value) !== ''
          )
        )
        .map((variant) => ({
          size: variant.size,
          qty: Number(variant.qty || 0),
          mrp: Number(variant.mrp || 0),
          rate: Number(variant.rate || 0),
          rack: variant.rack || form.rackNumber,
          color: selectedColors.join(', '),
        }));

      const body = new FormData();
      body.append('name', cleanText(form.productName));
      body.append('description', form.productDescription);
      body.append('dealerid', String(dealerId));
      body.append('business_type_id', String(user?.business_type_id ?? 2));
      body.append('color', selectedColors.join(', '));
      body.append('brand', form.brand);
      body.append('model', form.designNumber);
      body.append('attributes', JSON.stringify(attributes));
      body.append('size_sets', JSON.stringify(selectedSizeSetsForSave));
      body.append('show_in_create_order', showInCreateOrder ? '1' : '0');
      body.append('variants', JSON.stringify(variantsPayload));
      body.append(
        'gallery_keep',
        JSON.stringify(galleryImages.filter((image) => image.existing).map((image) => image.rawPath || image.uri))
      );

      appendImage(body, 'image', mainImage);
      colorVariants
        .filter((variant) => selectedColors.includes(variant.color))
        .forEach((variant, index) => appendImage(body, `color_variant_image_${index}`, variant.image));
      galleryImages
        .filter((image) => !image.existing)
        .forEach((image) => appendImage(body, 'gallery', image));

      const response = await fetch(
        isEditing && editProduct
          ? `${apiUrl}/products/update/${editProduct.id}`
          : `${apiUrl}/products`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body,
        }
      );
      const result = await parseJsonResponse(response);

      if (!response.ok || (!(result as any)?.success && !(result as any)?.id)) {
        throw new Error((result as any)?.message || 'Failed to save product');
      }

      invalidateCaches('/products');
      navigation.reset({
        index: 0,
        routes: [{ name: 'StaffScreen', params: { activeTab: 'products', refreshProductsAt: Date.now() } }],
      });
    } catch (error: any) {
      const message = error?.message || 'Failed to save product.';
      if (message === DUPLICATE_DESIGN_NUMBER_MESSAGE) {
        setDesignNumberError(message);
      }
      showAlert(message);
    } finally {
      setSaving(false);
    }
  }, [
    activeSizeSetIds,
    canManageProducts,
    colorVariants,
    currentSizeSets,
    dealerId,
    editProduct,
    form,
    galleryImages,
    isEditing,
    productNameRequired,
    dynamicSchema,
    dynamicValues,
    mainImage,
    navigation,
    saving,
    selectedColors,
    showAlert,
    showInCreateOrder,
    token,
    user?.business_type_id,
    variants,
  ]);

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenSkeleton rows={5} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Navbar user={user?.name} />
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        extraScrollHeight={36}
        showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityLabel="Back to products"
              style={styles.backButton}>
              <Ionicons name="arrow-back" size={21} color={OMS_COLORS.primaryDeep} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>{isEditing ? 'Edit Product' : 'Create Product'}</Text>
              <Text style={styles.subtitle}>
                Product information, images, sizes, colors, variants, and rates.
              </Text>
            </View>
          </View>

          {showProductInformation ? (
          <Section
            icon="cube-outline"
            title="Product Information"
            subtitle="Core garment identity and booking metadata.">
            {isFieldVisible('productName') ? (
              <Field
                label="Product Name"
                value={form.productName}
                onChangeText={(value) => setField('productName', titleCase(value))}
                placeholder="Premium Cotton Co-Ord Set"
              />
            ) : null}
            {isFieldVisible('designNumber') || isFieldVisible('launchDate') ? (
            <View style={styles.twoColumn}>
              {isFieldVisible('designNumber') ? (
              <View style={styles.flexField}>
                <Field
                  label="Design Number"
                  value={form.designNumber}
                  onChangeText={(value) => setField('designNumber', value.toUpperCase())}
                  placeholder="AN-2407"
                  error={designNumberError}
                />
              </View>
              ) : null}
              {isFieldVisible('launchDate') ? (
              <View style={styles.flexField}>
                <Field
                  label="Launch Date"
                  value={form.launchDate}
                  onChangeText={(value) => setField('launchDate', value)}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              ) : null}
            </View>
            ) : null}
            {isFieldVisible('brand') || isFieldVisible('bookingType') ? (
            <View style={styles.twoColumn}>
              {isFieldVisible('brand') ? (
              <View style={styles.flexField}>
                <Field label="Brand" value={form.brand} onChangeText={(value) => setField('brand', value)} placeholder="House Label" />
              </View>
              ) : null}
              {isFieldVisible('bookingType') ? (
              <View style={styles.flexField}>
                <Field label="Booking Type" value={form.bookingType} onChangeText={(value) => setField('bookingType', value)} placeholder="Ready / Prebook" />
              </View>
              ) : null}
            </View>
            ) : null}
            {isFieldVisible('category') || isFieldVisible('subCategory') ? (
            <View style={styles.twoColumn}>
              {isFieldVisible('category') ? (
              <View style={styles.flexField}>
                <Field label="Category" value={form.category} onChangeText={(value) => setField('category', value)} placeholder="Kurta" />
              </View>
              ) : null}
              {isFieldVisible('subCategory') ? (
              <View style={styles.flexField}>
                <Field label="Sub Category" value={form.subCategory} onChangeText={(value) => setField('subCategory', value)} placeholder="Casual" />
              </View>
              ) : null}
            </View>
            ) : null}
            {isFieldVisible('fabricType') || isFieldVisible('styleDesign') ? (
            <View style={styles.twoColumn}>
              {isFieldVisible('fabricType') ? (
              <View style={styles.flexField}>
                <Field label="Style / Fabric" value={form.fabricType} onChangeText={(value) => setField('fabricType', value)} placeholder="Cotton" />
              </View>
              ) : null}
              {isFieldVisible('styleDesign') ? (
              <View style={styles.flexField}>
                <Field label="Style / Design" value={form.styleDesign} onChangeText={(value) => setField('styleDesign', value)} placeholder="Printed" />
              </View>
              ) : null}
            </View>
            ) : null}
            {isFieldVisible('hsnCode') || isFieldVisible('fitType') ? (
            <View style={styles.twoColumn}>
              {isFieldVisible('hsnCode') ? (
              <View style={styles.flexField}>
                <Field label="HSN Code" value={form.hsnCode} onChangeText={(value) => setField('hsnCode', value)} placeholder="6102" />
              </View>
              ) : null}
              {isFieldVisible('fitType') ? (
              <View style={styles.flexField}>
                <Field label="Fit Type" value={form.fitType} onChangeText={(value) => setField('fitType', value)} placeholder="Regular" />
              </View>
              ) : null}
            </View>
            ) : null}
            {isFieldVisible('masterCategory') ? <Field label="Master Category" value={form.masterCategory} onChangeText={(value) => setField('masterCategory', value)} placeholder="Women" /> : null}
            {isFieldVisible('barcodeSku') ? <Field label="Barcode / SKU" value={form.barcodeSku} onChangeText={(value) => setField('barcodeSku', value.toUpperCase())} placeholder="SKU-9834" /> : null}
            {isFieldVisible('productTags') ? <Field label="Product Tags" value={form.productTags} onChangeText={(value) => setField('productTags', value)} placeholder="festive, bestseller" /> : null}
            {isFieldVisible('productDescription') ? (
              <Field
                label="Product Description"
                value={form.productDescription}
                onChangeText={(value) => setField('productDescription', value)}
                placeholder="Fabric feel, work details, dispatch notes..."
                multiline
              />
            ) : null}
            <View style={styles.switchGrid}>
              {[
                ['Trending Product', form.trendingProduct, (value: boolean) => setField('trendingProduct', value)],
                ['New Arrival', form.newArrival, (value: boolean) => setField('newArrival', value)],
                ['Show in Create Order', showInCreateOrder, setShowInCreateOrder],
              ].map(([label, value, onChange]) => (
                <View key={String(label)} style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{String(label)}</Text>
                  <Switch
                    value={Boolean(value)}
                    onValueChange={onChange as (value: boolean) => void}
                    trackColor={{ false: '#CBD5E1', true: OMS_COLORS.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          </Section>
          ) : null}

          {dynamicFormFields.length > 0 ? (
          <Section icon="options-outline" title="Business Fields" subtitle="Fields configured for this dealer.">
            {dynamicFormFields.map((field) => {
              const value = dynamicValues[field.field_key] ?? '';
              const options = parseFieldOptions(field);
              if (field.field_type === 'select') {
                return (
                  <View key={field.field_key} style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>{field.field_label}</Text>
                    <View style={styles.chipRow}>
                      {options.map((option) => (
                        <Pressable
                          key={option}
                          onPress={() => setDynamicValue(field.field_key, option)}
                          style={[styles.chip, value === option && styles.chipSelected]}>
                          <Text style={[styles.chipText, value === option && styles.chipSelectedText]}>{option}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {options.length === 0 ? (
                      <TextInput
                        value={value}
                        onChangeText={(next) => setDynamicValue(field.field_key, next)}
                        placeholder={field.field_label}
                        placeholderTextColor="#64748B"
                        style={styles.input}
                      />
                    ) : null}
                  </View>
                );
              }
              if (field.field_type === 'multiselect') {
                const selected = parseMultiValue(value);
                return (
                  <View key={field.field_key} style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>{field.field_label}</Text>
                    <View style={styles.chipRow}>
                      {options.map((option) => (
                        <Pressable
                          key={option}
                          onPress={() => toggleDynamicMultiValue(field.field_key, option)}
                          style={[styles.chip, selected.includes(option) && styles.chipSelected]}>
                          <Text style={[styles.chipText, selected.includes(option) && styles.chipSelectedText]}>{option}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {options.length === 0 ? (
                      <TextInput
                        value={selected.join(', ')}
                        onChangeText={(next) => setDynamicValue(field.field_key, next)}
                        placeholder={field.field_label}
                        placeholderTextColor="#64748B"
                        style={styles.input}
                      />
                    ) : null}
                  </View>
                );
              }
              if (field.field_type === 'checkbox') {
                const checked = value === '1' || value === 'true';
                return (
                  <View key={field.field_key} style={styles.switchRow}>
                    <Text style={styles.switchLabel}>{field.field_label}</Text>
                    <Switch
                      value={checked}
                      onValueChange={(next) => setDynamicValue(field.field_key, next ? '1' : '0')}
                      trackColor={{ false: '#CBD5E1', true: OMS_COLORS.accent }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                );
              }
              return (
                <Field
                  key={field.field_key}
                  label={field.field_label}
                  value={value}
                  onChangeText={(next) => setDynamicValue(field.field_key, field.field_type === 'number' ? cleanNumber(next) : next)}
                  placeholder={field.field_label}
                  keyboardType={field.field_type === 'number' ? 'decimal-pad' : 'default'}
                  multiline={field.field_type === 'textarea'}
                />
              );
            })}
          </Section>
          ) : null}

          {showImagesGallery ? (
          <Section icon="images-outline" title="Images and Gallery" subtitle="Main image, gallery slots, and color-specific photos.">
            {isFieldVisible('mainProductImage') ? (
            <Pressable
              onPress={() =>
                openImagePickerSheet(false, (images) => {
                  if (images[0]) setMainImage(images[0]);
                })
              }
              style={styles.imagePicker}>
              {mainImage ? (
                <Image source={cachedImageSource(mainImage.uri)} style={styles.mainImage} resizeMode="contain" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={28} color={OMS_COLORS.primary} />
                  <Text style={styles.imagePlaceholderText}>Choose main product image</Text>
                </View>
              )}
            </Pressable>
            ) : null}
            {isFieldVisible('galleryImages') ? (
            <>
            <Pressable
              onPress={() =>
                openImagePickerSheet(true, (images) => {
                  setGalleryImages((current) => [...current, ...images]);
                })
              }
              style={styles.outlineButton}>
              <Ionicons name="images-outline" size={17} color={OMS_COLORS.primary} />
              <Text style={styles.outlineButtonText}>Add Gallery Images</Text>
            </Pressable>
            {galleryImages.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.galleryRow}>
                  {galleryImages.map((image, index) => (
                    <View key={image.id} style={styles.galleryItem}>
                      <Image source={cachedImageSource(image.uri)} style={styles.galleryImage} resizeMode="cover" />
                      <View style={styles.galleryActions}>
                        <Pressable
                          disabled={index === 0}
                          onPress={() =>
                            setGalleryImages((current) => {
                              const next = [...current];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              return next;
                            })
                          }
                          style={styles.galleryAction}>
                          <Ionicons name="chevron-back" size={14} color={OMS_COLORS.primaryDeep} />
                        </Pressable>
                        <Pressable
                          onPress={() => setGalleryImages((current) => current.filter((item) => item.id !== image.id))}
                          style={styles.galleryAction}>
                          <Ionicons name="trash-outline" size={14} color={OMS_COLORS.danger} />
                        </Pressable>
                        <Pressable
                          disabled={index === galleryImages.length - 1}
                          onPress={() =>
                            setGalleryImages((current) => {
                              const next = [...current];
                              [next[index], next[index + 1]] = [next[index + 1], next[index]];
                              return next;
                            })
                          }
                          style={styles.galleryAction}>
                          <Ionicons name="chevron-forward" size={14} color={OMS_COLORS.primaryDeep} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : null}
            </>
            ) : null}
          </Section>
          ) : null}

          {showSizesColors ? (
          <Section
            icon="shirt-outline"
            title={isGarmentBusiness ? 'Sizes and Colors' : 'Packaging'}
            subtitle={isGarmentBusiness ? 'Select colors and size rows for booking.' : 'Select pack sizes configured for this dealer.'}>
            {isFieldVisible('availableColors') ? (
            <>
            <Text style={styles.fieldLabel}>Available Colors / Styles</Text>
            <View style={styles.chipRow}>
              {DEFAULT_COLORS.map((color) => {
                const selected = selectedColors.includes(color.name);
                return (
                  <Pressable
                    key={color.name}
                    onPress={() => (selected ? removeColor(color.name) : addColor(color.name))}
                    style={[styles.colorChip, selected && styles.chipSelected]}>
                    <View style={[styles.colorDot, { backgroundColor: color.hex }]} />
                    <Text style={[styles.chipText, selected && styles.chipSelectedText]}>{color.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.inlineAdd}>
              <TextInput
                value={selectedColorInput}
                onChangeText={setSelectedColorInput}
                placeholder="Add custom color"
                placeholderTextColor="#64748B"
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <Pressable onPress={() => addColor(selectedColorInput)} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Add</Text>
              </Pressable>
            </View>
            </>
            ) : null}

            {isFieldVisible('availableSizes') ? (
            <>
            {isGarmentBusiness ? (
              <>
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Size Type</Text>
              <View style={styles.chipRow}>
                {SIZE_SYSTEMS.map((system) => (
                  <Pressable
                    key={system.key}
                    onPress={() => {
                      setSelectedSizeSystem(system.key);
                      setSelectedSizes([]);
                      setActiveSizeSetIds([]);
                    }}
                    style={[styles.chip, selectedSizeSystem === system.key && styles.chipSelected]}>
                    <Text style={[styles.chipText, selectedSizeSystem === system.key && styles.chipSelectedText]}>{system.label}</Text>
                  </Pressable>
                ))}
              </View>
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{isGarmentBusiness ? 'Available Sizes' : variantFieldLabel}</Text>
            <View style={styles.chipRow}>
              {sizeOptions.map((size) => (
                <Pressable
                  key={size}
                  onPress={() => toggleSize(size)}
                  style={[styles.sizeChip, selectedSizes.includes(size) && styles.chipSelected]}>
                  <Text style={[styles.chipText, selectedSizes.includes(size) && styles.chipSelectedText]}>{size}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.inlineAdd}>
              <TextInput
                value={customSize}
                onChangeText={setCustomSize}
                placeholder="Add custom size"
                placeholderTextColor="#64748B"
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <Pressable
                onPress={() => {
                  const value = customSize.trim().toUpperCase();
                  if (!value) return;
                  toggleSize(value);
                  setCustomSize('');
                }}
                style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Add</Text>
              </Pressable>
            </View>
            </>
            ) : null}
          </Section>
          ) : null}

          {showColorVariantConfiguration && colorVariants.length > 0 ? (
          <Section icon="color-palette-outline" title="Color Variant Configuration" subtitle="Dedicated image and design number per color.">
              {colorVariants.map((variant, index) => (
                <View key={variant.id} style={styles.variantCard}>
                  <View style={styles.variantHeader}>
                    <View style={[styles.colorDot, { backgroundColor: variant.hex }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.variantTitle}>{variant.color}</Text>
                      <Text style={styles.variantSubtitle}>Color option {index + 1}</Text>
                    </View>
                    {imageVisible && isSectionVisible('imagesGallery') && isFieldVisible('mainProductImage') ? <Pressable
                      onPress={() =>
                        openImagePickerSheet(false, (images) => {
                          if (images[0]) updateColorVariant(variant.id, { image: images[0], rawImage: '' });
                        })
                      }
                      style={styles.variantImageButton}>
                      <Ionicons name="image-outline" size={15} color={OMS_COLORS.primary} />
                      <Text style={styles.variantImageText}>Image</Text>
                    </Pressable> : null}
                  </View>
                  {imageVisible && isSectionVisible('imagesGallery') && isFieldVisible('mainProductImage') ? <View style={styles.colorPreview}>
                    {variant.image?.uri || mainImage?.uri ? (
                      <Image source={cachedImageSource(variant.image?.uri || mainImage?.uri)} style={styles.colorPreviewImage} resizeMode="contain" />
                    ) : (
                      <Text style={styles.mutedText}>Uses main image</Text>
                    )}
                  </View> : null}
                  <Field label="Design Number" value={variant.designNumber} onChangeText={(value) => updateColorVariant(variant.id, { designNumber: value.toUpperCase() })} placeholder={form.designNumber || 'AN-2407-B'} />
                </View>
              ))}
            </Section>
          ) : null}

          {showSizeSetManagement ? (
          <Section icon="albums-outline" title="Size Set Management" subtitle="Create reusable sets from selected individual sizes.">
            <Text style={styles.fieldLabel}>Size Set</Text>
            {currentSizeSets.map((sizeSet) => {
              const selected = activeSizeSetIds.includes(sizeSet.id);
              return (
                <Pressable
                  key={sizeSet.id}
                  onPress={() => toggleSizeSet(sizeSet)}
                  style={[styles.sizeSetCard, selected && styles.sizeSetCardSelected]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sizeSetName}>{sizeSet.name}</Text>
                    <Text style={styles.sizeSetSizes}>{sizeSet.sizes.join(', ')}</Text>
                  </View>
                  {sizeSet.id !== DEFAULT_SIZE_SET.id ? (
                    <Pressable
                      onPress={() => setSizeSets((current) => current.filter((item) => item.id !== sizeSet.id))}
                      hitSlop={8}>
                      <Ionicons name="trash-outline" size={17} color={OMS_COLORS.danger} />
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
            <View style={styles.inlineAdd}>
              <TextInput
                value={sizeSetName}
                onChangeText={setSizeSetName}
                placeholder="Set name e.g. XS-XL"
                placeholderTextColor="#64748B"
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <Pressable onPress={saveSizeSet} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Save Set</Text>
              </Pressable>
            </View>
          </Section>
          ) : null}

          {showRateSetup ? (
          <Section
            icon="pricetag-outline"
            title={isGarmentBusiness ? 'Rate Setup' : 'Dairy Variants'}
            subtitle={isGarmentBusiness ? 'Selected sizes drive the product variant rows.' : `Selected ${variantFieldLabel.toLowerCase()} options drive variant rows.`}>
            {variants.map((variant) => (
              <View key={variant.id} style={styles.rateRow}>
                <View style={styles.rateSize}>
                  <Text style={styles.rateSizeText}>{variant.size || 'Free Entry'}</Text>
                </View>
                <TextInput value={variant.qty} onChangeText={(value) => updateVariant(variant.id, 'qty', cleanNumber(value))} placeholder="Qty" keyboardType="number-pad" style={styles.rateInput} />
                <TextInput value={variant.mrp} onChangeText={(value) => updateVariant(variant.id, 'mrp', cleanNumber(value))} placeholder="MRP" keyboardType="decimal-pad" style={styles.rateInput} />
                <TextInput value={variant.rate} onChangeText={(value) => updateVariant(variant.id, 'rate', cleanNumber(value))} placeholder="Rate" keyboardType="decimal-pad" style={styles.rateInput} />
                <TextInput value={variant.rack} onChangeText={(value) => updateVariant(variant.id, 'rack', value)} placeholder="Rack" style={styles.rateInput} />
              </View>
            ))}
          </Section>
          ) : null}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Quick Summary</Text>
            {isGarmentBusiness ? <Text style={styles.summaryLine}>Design: {form.designNumber || 'Not set'}</Text> : null}
            {isGarmentBusiness ? <Text style={styles.summaryLine}>Colors: {selectedColors.length}</Text> : null}
            <Text style={styles.summaryLine}>{isGarmentBusiness ? 'Sizes' : variantFieldLabel}: {effectiveSizes.length}</Text>
            <Text style={styles.summaryLine}>Total Pieces: {totalPieces}</Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              disabled={saving}
              style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={saveItem}
              disabled={saving}
              style={[styles.button, styles.primaryButton, saving && styles.buttonDisabled]}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isEditing ? 'Save Product' : 'Create Product'}
                </Text>
              )}
            </Pressable>
          </View>
      </KeyboardAwareScrollView>
      <Modal
        visible={Boolean(imagePickerRequest) && imageVisible}
        transparent
        animationType="slide"
        onRequestClose={closeImagePickerSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={closeImagePickerSheet}>
          <Pressable style={styles.imageSourceSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Product Image</Text>
            <Pressable
              onPress={() => launchImagePicker('camera')}
              style={styles.sheetAction}>
              <Ionicons name="camera-outline" size={22} color={OMS_COLORS.primary} />
              <Text style={styles.sheetActionText}>Take Photo</Text>
            </Pressable>
            <Pressable
              onPress={() => launchImagePicker('gallery')}
              style={styles.sheetAction}>
              <Ionicons name="images-outline" size={22} color={OMS_COLORS.primary} />
              <Text style={styles.sheetActionText}>Choose from Gallery</Text>
            </Pressable>
            <Pressable
              onPress={closeImagePickerSheet}
              style={[styles.sheetAction, styles.sheetCancelAction]}>
              <Ionicons name="close-circle-outline" size={22} color={OMS_COLORS.danger} />
              <Text style={[styles.sheetActionText, styles.sheetCancelText]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <CustomAlert
        visible={alertVisible}
        message={alertMsg}
        onClose={() => setAlertVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: OMS_COLORS.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
  },
  section: {
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: OMS_COLORS.surfaceTint,
    marginBottom: 14,
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: OMS_COLORS.primaryBorder,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OMS_COLORS.primarySoft,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: OMS_COLORS.primaryDeep,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: OMS_COLORS.textMuted,
  },
  sectionBody: {
    padding: 14,
  },
  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  input: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 15,
    color: OMS_COLORS.text,
  },
  inputError: {
    borderColor: '#DC2626',
  },
  fieldError: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  textArea: {
    minHeight: 92,
    paddingTop: 10,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 10,
  },
  flexField: {
    flex: 1,
    minWidth: 0,
  },
  switchGrid: {
    gap: 8,
  },
  switchRow: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: OMS_COLORS.primaryDeep,
  },
  imagePicker: {
    minHeight: 168,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 10,
  },
  mainImage: {
    width: '100%',
    height: 190,
  },
  imagePlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    color: OMS_COLORS.primaryDeep,
    fontWeight: '800',
  },
  outlineButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  outlineButtonText: {
    color: OMS_COLORS.primary,
    fontWeight: '800',
  },
  galleryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  galleryItem: {
    width: 112,
    height: 132,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
  },
  galleryImage: {
    width: '100%',
    height: 96,
  },
  galleryActions: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  galleryAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  sizeChip: {
    minWidth: 44,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: OMS_COLORS.primary,
    borderColor: OMS_COLORS.primary,
  },
  chipText: {
    color: OMS_COLORS.primaryDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  chipSelectedText: {
    color: '#FFFFFF',
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  inlineAdd: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  smallButton: {
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OMS_COLORS.primary,
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  variantCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: 'rgba(248,250,252,0.86)',
    padding: 12,
    marginBottom: 12,
  },
  variantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 10,
  },
  variantTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: OMS_COLORS.primaryDeep,
  },
  variantSubtitle: {
    fontSize: 11,
    color: OMS_COLORS.textMuted,
  },
  variantImageButton: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  variantImageText: {
    fontSize: 12,
    fontWeight: '800',
    color: OMS_COLORS.primary,
  },
  colorPreview: {
    height: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  colorPreviewImage: {
    width: '100%',
    height: '100%',
  },
  mutedText: {
    color: OMS_COLORS.textMuted,
    fontWeight: '700',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.46)',
  },
  imageSourceSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 14,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 16,
  },
  sheetTitle: {
    marginBottom: 12,
    color: OMS_COLORS.primaryDeep,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  sheetAction: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sheetActionText: {
    color: OMS_COLORS.primaryDeep,
    fontSize: 16,
    fontWeight: '800',
  },
  sheetCancelAction: {
    backgroundColor: '#FFF7F7',
    borderColor: '#FECACA',
    marginBottom: 0,
  },
  sheetCancelText: {
    color: OMS_COLORS.danger,
  },
  sizeSetCard: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sizeSetCardSelected: {
    backgroundColor: OMS_COLORS.primarySoft,
    borderColor: OMS_COLORS.primary,
  },
  sizeSetName: {
    fontSize: 14,
    fontWeight: '900',
    color: OMS_COLORS.primaryDeep,
  },
  sizeSetSizes: {
    marginTop: 2,
    fontSize: 12,
    color: OMS_COLORS.textMuted,
  },
  rateRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  rateSize: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: OMS_COLORS.primarySoft,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  rateSizeText: {
    fontSize: 13,
    fontWeight: '900',
    color: OMS_COLORS.primary,
  },
  rateInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    color: OMS_COLORS.text,
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: OMS_COLORS.surfaceTint,
    padding: 14,
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: OMS_COLORS.primaryDeep,
    marginBottom: 8,
  },
  summaryLine: {
    fontSize: 13,
    color: OMS_COLORS.textMuted,
    marginBottom: 5,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
  },
  primaryButton: {
    backgroundColor: OMS_COLORS.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: OMS_COLORS.primaryDeep,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
