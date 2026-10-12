export function hasCreateRetailerPermission(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function hasCreateProductPermission(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function canManageProductsForUser(user?: Record<string, any> | null): boolean {
  if (!user) return false;
  if (user.role === 'dealer') return true;
  return user.role === 'staff' && hasCreateProductPermission(user.can_create_products);
}

export function getProductDealerId(user?: Record<string, any> | null): number | null {
  if (!user) return null;
  const id = user.role === 'dealer' ? user.id : user.dealer_id;
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
