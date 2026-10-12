import { apiUrl } from 'apiurl';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { invalidateCaches } from './cache';
import { hasCreateRetailerPermission } from './permissions';

export interface CustomerFormData {
  username: string;
  name: string;
  ledger: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
  custom_fields: Record<string, string>;
}

export interface RetailerCustomer {
  id: number;
  username?: string;
  name: string;
  contact_person?: string;
  ledger?: string;
  email?: string;
  phone: string;
  address: string;
  city?: string;
  assigned?: string | number | null;
}

export const EMPTY_CUSTOMER_FORM: CustomerFormData = {
  username: '',
  name: '',
  ledger: '',
  email: '',
  phone: '',
  address: '',
  password: '',
  confirmPassword: '',
  custom_fields: {},
};

export type CustomerStandardFieldKey =
  | 'username'
  | 'name'
  | 'ledger'
  | 'email'
  | 'phone'
  | 'address'
  | 'password'
  | 'confirmPassword';

export type CustomerCustomFieldType = 'text' | 'number' | 'select';

export interface CustomerFieldRule {
  visible: boolean;
  required: boolean;
  locked?: boolean;
}

export interface CustomerCustomFieldSetting extends CustomerFieldRule {
  id: string;
  key: string;
  label: string;
  type: CustomerCustomFieldType;
  options: string[];
}

export interface CustomerCreationSettings {
  fields: Record<CustomerStandardFieldKey, CustomerFieldRule>;
  customFields: CustomerCustomFieldSetting[];
}

export const DEFAULT_CUSTOMER_CREATION_SETTINGS: CustomerCreationSettings = {
  fields: {
    username: { visible: true, required: false },
    name: { visible: true, required: true, locked: true },
    ledger: { visible: true, required: true },
    email: { visible: true, required: true },
    phone: { visible: true, required: true, locked: true },
    address: { visible: true, required: false },
    password: { visible: true, required: false },
    confirmPassword: { visible: true, required: false },
  },
  customFields: [],
};

const CUSTOMER_STANDARD_FIELD_ORDER: CustomerStandardFieldKey[] = [
  'username',
  'name',
  'ledger',
  'email',
  'phone',
  'address',
  'password',
  'confirmPassword',
];

const LOCKED_CUSTOMER_FIELDS: CustomerStandardFieldKey[] = ['name', 'phone'];

export const normalizeText = (value: unknown) => String(value ?? '').trim();
export const normalizePhone = (value: unknown) => normalizeText(value).replace(/\D/g, '');

function asBool(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
}

export function normalizeCustomerCreationSettings(value: unknown): CustomerCreationSettings {
  const incoming = value && typeof value === 'object' ? (value as Record<string, any>) : {};
  const incomingFields = incoming.fields && typeof incoming.fields === 'object' ? incoming.fields : incoming;
  const fields = CUSTOMER_STANDARD_FIELD_ORDER.reduce((acc, key) => {
    const defaults = DEFAULT_CUSTOMER_CREATION_SETTINGS.fields[key];
    const raw = incomingFields[key] && typeof incomingFields[key] === 'object' ? incomingFields[key] : {};
    const locked = LOCKED_CUSTOMER_FIELDS.includes(key);
    const legacyLockedCredential = (key === 'password' || key === 'confirmPassword') && raw.locked === true;
    acc[key] = {
      visible: locked ? true : asBool(raw.visible, defaults.visible),
      required: locked ? true : asBool(raw.required, legacyLockedCredential ? false : defaults.required),
      locked: locked || undefined,
    };
    return acc;
  }, {} as CustomerCreationSettings['fields']);

  const seen = new Set<string>();
  const customFields = Array.isArray(incoming.customFields)
    ? incoming.customFields
        .map((field: any, index: number) => {
          const label = normalizeText(field?.label ?? field?.field_label);
          if (!label) return null;
          const baseKey = normalizeText(field?.key ?? field?.field_key) || `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
          const key = seen.has(baseKey) ? `${baseKey}_${index}` : baseKey;
          seen.add(key);
          const type = ['text', 'number', 'select'].includes(field?.type ?? field?.field_type)
            ? (field.type ?? field.field_type)
            : 'text';
          return {
            id: String(field?.id ?? key),
            key,
            label,
            type,
            visible: asBool(field?.visible, true),
            required: asBool(field?.required ?? field?.is_required, false),
            options: Array.isArray(field?.options)
              ? field.options.map((option: unknown) => normalizeText(option)).filter(Boolean)
              : [],
          } as CustomerCustomFieldSetting;
        })
        .filter(Boolean) as CustomerCustomFieldSetting[]
    : [];

  return { fields, customFields };
}

function customerSettingsCacheKey(dealerId: number) {
  return `customer_creation_settings_${dealerId}`;
}

export async function loadCustomerCreationSettings(dealerId: number, token: string) {
  const cacheKey = customerSettingsCacheKey(dealerId);
  try {
    const response = await fetch(`${apiUrl}/customer-creation-settings?dealerid=${encodeURIComponent(String(dealerId))}`, {
      headers: authHeaders(token),
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error('Failed to load customer creation settings');
    const settings = normalizeCustomerCreationSettings((data as any)?.settings);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return normalizeCustomerCreationSettings(JSON.parse(cached));
    throw error;
  }
}

export function canCreateCustomersForUser(user?: Record<string, any> | null): boolean {
  if (!user) return false;
  if (user.role === 'dealer') return true;
  return user.role === 'staff' && hasCreateRetailerPermission(user.can_create_retailers);
}

export function getCustomerDealerId(user?: Record<string, any> | null): number | null {
  if (!user) return null;
  const id = user.role === 'dealer' ? user.id : user.dealer_id;
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function toQueryString(params: Record<string, string | number | null | undefined>) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
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

export async function generateCustomerUsername({
  name,
  phone,
  token,
}: {
  name: string;
  phone: string;
  token: string;
}) {
  const params = toQueryString({
    name: normalizeText(name),
    phone: normalizePhone(phone),
  });

  const response = await fetch(`${apiUrl}/users/generate-username?${params}`, {
    headers: authHeaders(token),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error('Unable to generate username');
  return normalizeText((data as any)?.username);
}

export async function checkCustomerUsernameAndPhone({
  username,
  phone,
  token,
}: {
  username: string;
  phone: string;
  token: string;
}) {
  const safeUsername = normalizeText(username);
  const safePhone = normalizePhone(phone);
  const params = toQueryString({
    username: safeUsername,
    phone: safePhone,
  });

  const response = await fetch(`${apiUrl}/users/check-unique?${params}`, {
    headers: authHeaders(token),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error('Unable to check username or mobile number');

  return {
    duplicateUsername: Boolean((data as any)?.duplicateUsername),
    duplicatePhone: Boolean((data as any)?.duplicatePhone),
  };
}

export async function checkRetailerDuplicates({
  username,
  email,
  phone,
  token,
}: {
  username: string;
  email: string;
  phone: string;
  token: string;
}) {
  const params = toQueryString({
    username: normalizeText(username),
    email: normalizeText(email).toLowerCase(),
    phone: normalizePhone(phone),
    excludeId: '',
  });

  const response = await fetch(`${apiUrl}/retailers/check-duplicate?${params}`, {
    headers: authHeaders(token),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error('Unable to check customer duplicates');

  return {
    duplicateUsername: Boolean((data as any)?.duplicateUsername),
    duplicateEmail: Boolean((data as any)?.duplicateEmail),
    duplicatePhone: Boolean((data as any)?.duplicatePhone),
  };
}

export async function fetchRetailerCustomers(dealerId: number, token: string) {
  const response = await fetch(`${apiUrl}/retailers?dealerid=${dealerId}`, {
    headers: authHeaders(token),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error('Failed to fetch customer list');
  return Array.isArray(data) ? (data as RetailerCustomer[]) : [];
}

export async function createRetailerCustomer({
  form,
  dealerId,
  token,
}: {
  form: CustomerFormData;
  dealerId: number;
  token: string;
}) {
  const payload = {
    username: normalizeText(form.username),
    name: normalizeText(form.name),
    contact_person: '',
    ledger: normalizeText(form.ledger),
    email: normalizeText(form.email).toLowerCase(),
    phone: normalizePhone(form.phone),
    address: normalizeText(form.address),
    password: form.password,
    confirmPassword: form.confirmPassword,
    custom_fields: form.custom_fields ?? {},
    dealer_id: dealerId,
    role: 'retailer',
  };

  const response = await fetch(`${apiUrl}/retailers`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const messages = (data as any)?.messages;
    const firstMessage =
      messages && typeof messages === 'object'
        ? Object.values(messages).find((value) => typeof value === 'string')
        : null;
    throw new Error(
      (data as any)?.message ||
        messages?.error ||
        messages?.user_limit ||
        (typeof firstMessage === 'string' ? firstMessage : 'Failed to add customer')
    );
  }

  invalidateCaches('/retailers');
  return data as { id?: number | string; success?: boolean; message?: string };
}
