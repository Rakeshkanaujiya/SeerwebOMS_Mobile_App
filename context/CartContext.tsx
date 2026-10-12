import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';
import { invalidateCaches } from '../src/lib/cache';
import { clampCartQuantity, getCartLinePieceQuantity } from '../src/lib/cart';
import { refreshCartPricing } from '../src/lib/cartPricing';
import type { CartProductDetail } from '../src/lib/cart';

export interface ProductVariant {
  id: number | string;
  size?: string;
  color?: string;
  rate?: number;
  mrp?: number;
  qty: number;
  rack?: string;
}

export interface CartItem {
  productId: number;
  variantId: number | string;
  size?: string;
  color?: string;
  price: number;
  quantity: number;
  stock: number;
  mrp?: number;
  rack?: string;
  productName?: string;
  image?: string | null;
  brand?: string;
  model?: string;
  businessTypeId?: number | null;
  attributes?: Record<string, any>;
  setQuantity?: number;
  orderMode?: 'piece' | 'size_set';
  sizeSetId?: string;
  sizeSetName?: string;
  sizeSetSizes?: string[];
  garmentMeta?: {
    designNumber?: string;
    fabricType?: string;
    bookingType?: string;
    selectedColor?: string;
    selectedImage?: string;
    selectedSku?: string;
    selectedPrice?: number;
    selectedStock?: number;
    selectedSizes?: string[];
    sizeSetSizes?: string[];
    productTags?: string[];
    galleryImages?: string[];
  };
}

export interface OrderEditSession {
  orderId: string;
  retailerId?: string | number | null;
  retailerName?: string;
  notes?: string;
}

type CartAction =
  | { type: 'REPRICE'; payload: Record<number, CartProductDetail> }
  | { type: 'LOAD'; payload: CartItem[] }
  | { type: 'ADD'; payload: CartItem }
  | {
      type: 'UPDATE';
      payload: { productId: number; variantId: number | string; quantity: number; color?: string };
    }
  | { type: 'REMOVE'; payload: { productId: number; variantId: number | string; color?: string } }
  | { type: 'CLEAR' };

export const CART_USER_CHANGED_EVENT = 'cartUserChanged';

export const getCartStorageKey = (userId?: string | number | null) =>
  userId ? `cart_${userId}` : 'cart_guest';

export const getOrderEditStorageKey = (userId?: string | number | null) =>
  userId ? `cart_edit_order_${userId}` : 'cart_edit_order_guest';

const normalizeCartColor = (color?: string) => String(color ?? '').trim().toLowerCase();

function isSameCartLine(
  item: CartItem,
  payload: { productId: number; variantId: number | string; color?: string }
) {
  if (item.productId !== payload.productId || String(item.variantId) !== String(payload.variantId)) {
    return false;
  }
  if (payload.color === undefined) return true;
  return normalizeCartColor(item.color) === normalizeCartColor(payload.color);
}

const cartReducer = (state: CartItem[], action: CartAction): CartItem[] => {
  const safeState = Array.isArray(state) ? state : [];

  switch (action.type) {
    case 'REPRICE':
      return refreshCartPricing(safeState, action.payload);
    case 'LOAD':
      return Array.isArray(action.payload) ? action.payload : [];

    case 'ADD': {
      const index = safeState.findIndex((item) => isSameCartLine(item, action.payload));

      if (index >= 0) {
        const next = [...safeState];
        const stock =
          action.payload.stock && action.payload.stock > 0
            ? action.payload.stock
            : next[index].stock;

        next[index] = {
          ...next[index],
          ...action.payload,
          stock,
          quantity: clampCartQuantity(next[index].quantity + action.payload.quantity, stock),
          setQuantity:
            Number(next[index].setQuantity ?? 0) + Number(action.payload.setQuantity ?? 0),
        };

        return next.filter((item) => item.quantity > 0);
      }

      const quantity = clampCartQuantity(action.payload.quantity, action.payload.stock);
      if (quantity <= 0) return safeState;

      return [...safeState, { ...action.payload, quantity }];
    }

    case 'UPDATE':
      return safeState
        .map((item) =>
          isSameCartLine(item, action.payload)
            ? {
                ...item,
                quantity: clampCartQuantity(action.payload.quantity, item.stock),
              }
            : item
        )
        .filter((item) => item.quantity > 0);

    case 'REMOVE':
      return safeState.filter((item) => !isSameCartLine(item, action.payload));

    case 'CLEAR':
      return [];

    default:
      return safeState;
  }
};

interface CartContextType {
  refreshPrices: (products: Record<number, CartProductDetail>) => void;
  cart: CartItem[];
  cartCount: number;
  editingOrder: OrderEditSession | null;
  addToCart: (item: Omit<CartItem, 'stock'> & { stock?: number }) => void;
  updateCartQuantity: (
    productId: number,
    variantId: number | string,
    quantity: number,
    color?: string
  ) => void;
  removeFromCart: (productId: number, variantId: number | string, color?: string) => void;
  removeProductFromCart: (productId: number, color?: string) => void;
  clearCart: () => void;
  loadCart: (items: CartItem[]) => void;
  startOrderEdit: (session: OrderEditSession, items: CartItem[]) => void;
  clearOrderEdit: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cart, dispatch] = useReducer(cartReducer, []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCountRef = useRef(0);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [editingOrder, setEditingOrder] = React.useState<OrderEditSession | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  useEffect(() => {
    const loadForUser = async (nextUserId: string | null) => {
      setHydrated(false);
      setUserId(nextUserId);

      try {
        const key = getCartStorageKey(nextUserId);
        const editKey = getOrderEditStorageKey(nextUserId);
        let saved = await AsyncStorage.getItem(key);
        const savedEdit = await AsyncStorage.getItem(editKey);

        if (!saved && nextUserId) {
          const legacyCart = await AsyncStorage.getItem('cart');
          if (legacyCart) {
            saved = legacyCart;
            await AsyncStorage.multiSet([[key, legacyCart]]);
            await AsyncStorage.removeItem('cart');
          }
        }

        if (!saved) {
          dispatch({ type: 'LOAD', payload: [] });
        } else {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            dispatch({ type: 'LOAD', payload: parsed });
          } else {
            dispatch({ type: 'LOAD', payload: [] });
            await AsyncStorage.removeItem(key);
          }
        }

        setEditingOrder(savedEdit ? JSON.parse(savedEdit) : null);
      } catch {
        dispatch({ type: 'LOAD', payload: [] });
        setEditingOrder(null);
      } finally {
        setHydrated(true);
      }
    };

    AsyncStorage.getItem('user').then((storedUser) => {
      try {
        const parsed = storedUser ? JSON.parse(storedUser) : null;
        void loadForUser(parsed?.id ? String(parsed.id) : null);
      } catch {
        void loadForUser(null);
      }
    });

    const listener = EventRegister.addEventListener(
      CART_USER_CHANGED_EVENT,
      (nextUserId: string | number | null) => {
        void loadForUser(nextUserId ? String(nextUserId) : null);
      }
    );

    return () => {
      EventRegister.removeEventListener(listener as string);
    };
  }, []);

  const { safeCart, cartCount } = useMemo(() => {
    const nextCart = Array.isArray(cart) ? cart : [];
    return {
      safeCart: nextCart,
      cartCount: nextCart.reduce((sum, item) => sum + getCartLinePieceQuantity(item), 0),
    };
  }, [cart]);

  useEffect(() => {
    if (!hydrated) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(getCartStorageKey(userId), JSON.stringify(safeCart));

        if (prevCountRef.current !== cartCount) {
          prevCountRef.current = cartCount;
          EventRegister.emit('cartChanged', cartCount);
        }
      } catch (error) {
        console.error('Cart save failed:', error);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [safeCart, cartCount, hydrated, userId]);

  useEffect(() => {
    if (!hydrated) return;
    const key = getOrderEditStorageKey(userId);
    if (editingOrder) {
      void AsyncStorage.setItem(key, JSON.stringify(editingOrder));
    } else {
      void AsyncStorage.removeItem(key);
    }
  }, [editingOrder, hydrated, userId]);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    setEditingOrder(null);
    invalidateCaches('/products');
    EventRegister.emit('cartChanged', 0);
    void AsyncStorage.removeItem(getCartStorageKey(userId));
    void AsyncStorage.removeItem(getOrderEditStorageKey(userId));
  }, [userId]);

  const addToCart = useCallback(
    (item: Partial<CartItem> & Pick<CartItem, 'productId' | 'variantId' | 'price' | 'quantity'>) => {
      dispatch({ type: 'ADD', payload: { ...item, stock: item.stock ?? 0 } as CartItem });
    },
    []
  );

  const updateCartQuantity = useCallback(
    (productId: number, variantId: number | string, quantity: number, color?: string) => {
      dispatch({ type: 'UPDATE', payload: { productId, variantId, quantity, color } });
    },
    []
  );

  const removeFromCart = useCallback((productId: number, variantId: number | string, color?: string) => {
    dispatch({ type: 'REMOVE', payload: { productId, variantId, color } });
  }, []);

  const removeProductFromCart = useCallback(
    (productId: number, color?: string) => {
      safeCart
        .filter(
          (item) =>
            item.productId === productId &&
            (color === undefined ||
              normalizeCartColor(item.color) === normalizeCartColor(color))
        )
        .forEach((item) => {
          dispatch({
            type: 'REMOVE',
            payload: { productId, variantId: item.variantId, color: item.color },
          });
        });
    },
    [safeCart]
  );

  const loadCart = useCallback((items: CartItem[]) => {
    dispatch({ type: 'LOAD', payload: Array.isArray(items) ? items : [] });
  }, []);
  const refreshPrices = useCallback((products: Record<number, CartProductDetail>) => {
    dispatch({ type: 'REPRICE', payload: products });
  }, []);

  const startOrderEdit = useCallback(
    (session: OrderEditSession, items: CartItem[]) => {
      const nextItems = Array.isArray(items) ? items : [];
      dispatch({ type: 'LOAD', payload: nextItems });
      setEditingOrder(session);
      void AsyncStorage.multiSet([
        [getCartStorageKey(userId), JSON.stringify(nextItems)],
        [getOrderEditStorageKey(userId), JSON.stringify(session)],
      ]);
      EventRegister.emit('cartChanged', nextItems.reduce((sum, item) => sum + getCartLinePieceQuantity(item), 0));
    },
    [userId]
  );

  const clearOrderEdit = useCallback(() => {
    setEditingOrder(null);
    void AsyncStorage.removeItem(getOrderEditStorageKey(userId));
  }, [userId]);

  const value = useMemo(
    () => ({
      refreshPrices,
      cart: safeCart,
      cartCount,
      editingOrder,
      addToCart,
      updateCartQuantity,
      removeFromCart,
      removeProductFromCart,
      clearCart,
      loadCart,
      startOrderEdit,
      clearOrderEdit,
    }),
    [
      refreshPrices,
      safeCart,
      cartCount,
      editingOrder,
      addToCart,
      updateCartQuantity,
      removeFromCart,
      removeProductFromCart,
      clearCart,
      loadCart,
      startOrderEdit,
      clearOrderEdit,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};
