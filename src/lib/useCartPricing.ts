import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useCart } from '../../context/CartContext';
import { fetchCartProducts } from './cartPricing';
import type { CartProductDetail } from './cart';

export function useCartPricing(dealerId: number, partyId: number) {
  const { cart, editingOrder, refreshPrices } = useCart();
  const ids = [...new Set(cart.map(item => item.productId))].sort((a, b) => a - b).join(',');
  const key = `${dealerId}:${partyId}:${ids}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key: '', loading: false, error: '', products: {} as Record<number, CartProductDetail> });
  useFocusEffect(useCallback(() => { setRevision(value => value + 1); }, []));
  useEffect(() => {
    if (!dealerId || !partyId) return;
    let active = true;
    setState({ key, loading: true, error: '', products: {} });
    void fetchCartProducts(dealerId, partyId, ids, Boolean(editingOrder)).then(products => {
      if (!active) return;
      // Editing an existing order retains its agreed rate/tax snapshot.
      if (!editingOrder) refreshPrices(products);
      setState({ key, loading: false, error: '', products });
    }).catch(error => {
      if (active) setState({ key, loading: false, error: error instanceof Error ? error.message : 'Unable to refresh prices', products: {} });
    });
    return () => { active = false; };
  }, [dealerId, partyId, ids, key, revision, refreshPrices, editingOrder]);
  const current = state.key === key;
  return { products: current ? state.products : {}, loading: Boolean(ids) && (!current || state.loading), error: current ? state.error : '' };
}
