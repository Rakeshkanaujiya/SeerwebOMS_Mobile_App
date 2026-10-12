import type { RootStackParamList } from '../../types/navigation';

export type UserRole = 'retailer' | 'staff' | 'dealer';

const ROLE_ROUTES: Partial<Record<UserRole, keyof RootStackParamList>> = {
  retailer: 'RetailerDashboard',
  staff: 'StaffDashboard',
  dealer: 'StaffDashboard',
};

export function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getHomeRouteForRole(role?: string | null): keyof RootStackParamList | null {
  if (!role) return null;
  return ROLE_ROUTES[role as UserRole] ?? null;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
