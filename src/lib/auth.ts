import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl } from 'apiurl';

function hasField(value: Record<string, any>, field: string) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function normalizeUserId(value: unknown) {
  return String(value ?? '');
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

export async function fetchCurrentUserProfile(token: string) {
  const response = await fetch(`${apiUrl}/validate-token`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as any).message)
        : 'Unable to refresh user profile';
    throw new Error(message);
  }

  return (typeof data === 'object' && data !== null && 'user' in data
    ? (data as any).user
    : data) as Record<string, any>;
}

type StaffPermissions = {
  can_create_retailers?: unknown;
  can_create_products?: unknown;
};

async function fetchStaffPermissionsFromDealerList(
  user: Record<string, any>,
  token: string
): Promise<StaffPermissions | null> {
  if (user.role !== 'staff' || !user.dealer_id || !user.id) return null;

  const response = await fetch(`${apiUrl}/staff/sales_executive?dealerid=${user.dealer_id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) return null;

  const staffRow = data.find(
    (staff: Record<string, any>) => normalizeUserId(staff.id) === normalizeUserId(user.id)
  );

  if (!staffRow) return null;

  const permissions: StaffPermissions = {};
  if (hasField(staffRow, 'can_create_retailers')) {
    permissions.can_create_retailers = staffRow.can_create_retailers;
  }
  if (hasField(staffRow, 'can_create_products')) {
    permissions.can_create_products = staffRow.can_create_products;
  }

  return Object.keys(permissions).length > 0 ? permissions : null;
}

export async function hydrateStaffPermissions(
  user: Record<string, any>,
  token: string
) {
  if (user.role !== 'staff') return user;

  let nextUser = user;
  try {
    const permissions = await fetchStaffPermissionsFromDealerList(user, token);
    if (permissions !== null) {
      nextUser = { ...nextUser, ...permissions };
    }
  } catch (error) {
    if (__DEV__) console.warn('Failed to hydrate staff permissions:', error);
  }

  if (!hasField(nextUser, 'can_create_retailers')) {
    nextUser = { ...nextUser, can_create_retailers: 0 };
  }
  if (!hasField(nextUser, 'can_create_products')) {
    nextUser = { ...nextUser, can_create_products: 0 };
  }

  return nextUser;
}

export async function hydrateStaffCreateCustomerPermission(
  user: Record<string, any>,
  token: string
) {
  return hydrateStaffPermissions(user, token);
}

export async function refreshAuthenticatedUser(
  token: string,
  fallbackUser?: Record<string, any> | null
) {
  const freshUser = await fetchCurrentUserProfile(token);
  const mergedUser = fallbackUser ? { ...fallbackUser, ...freshUser } : freshUser;
  const nextUser = await hydrateStaffPermissions(mergedUser, token);
  await AsyncStorage.setItem('user', JSON.stringify(nextUser));
  return nextUser;
}
