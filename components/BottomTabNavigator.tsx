/**
 * BottomTabNavigator — FINAL FIX for screen overlap
 *
 * WHY screens were overlapping:
 *   navigation.navigate() in a NativeStack PUSHES the new screen ON TOP of
 *   the old one. Both screens exist in the stack simultaneously. During the
 *   slide animation both are rendered = overlap/flicker bug seen in screenshot.
 *
 * WHY replace() was slow:
 *   replace() unmounts the old screen and mounts a brand new one, triggering
 *   useEffect → AsyncStorage → API fetch from scratch = blank screen + delay.
 *
 * THE CORRECT FIX — CommonActions.reset():
 *   Resets the entire stack to exactly ONE screen (the target tab).
 *   - Old screen is gone immediately (no overlap)
 *   - No stacking, no animation conflict
 *   - Clean instant transition
 *   - Remount cost eliminated by screenDataCache (screens load from memory)
 *
 * screenDataCache (exported):
 *   Each screen saves its fetched data here on first load.
 *   On remount it reads from cache instantly and renders immediately,
 *   then optionally refreshes in the background.
 */
import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { safeJsonParse } from '../src/lib/app';
import { hasCreateProductPermission, hasCreateRetailerPermission } from '../src/lib/permissions';

// ── Module-level caches (persist across screen remounts) ──────────────────────
let _cachedRole: string | null = null;
let _cachedCanCreateRetailers = false;
let _cachedCanCreateProducts = false;

/**
 * screenDataCache — import this in any screen to avoid re-fetching on tab switch.
 *
 * Usage in a screen:
 *   import { screenDataCache } from 'components/BottomTabNavigator';
 *
 *   // On load: check cache first
 *   const cached = screenDataCache['StaffDashboard'];
 *   if (cached) { setOrders(cached.orders); setRetailers(cached.retailers); }
 *
 *   // After fetch: save to cache
 *   screenDataCache['StaffDashboard'] = { orders, retailers };
 */
export const screenDataCache: Record<string, any> = {};

export function clearRoleCache() {
  _cachedRole = null;
  _cachedCanCreateRetailers = false;
  _cachedCanCreateProducts = false;
  clearScreenCache();
}

export function clearScreenCache(screen?: string) {
  if (screen) delete screenDataCache[screen];
  else Object.keys(screenDataCache).forEach(k => delete screenDataCache[k]);
}

// ── Types ──────────────────────────────────────────────────────────────────────
type TabRoute = 'RetailerDashboard' | 'RetailerHome' | 'Cart' | 'RetailerOrderScreen'
  | 'StaffDashboard' | 'StaffScreen' | 'StaffCartScreen' | 'StaffOrderScreen' | 'MoreScreen';
interface TabItem {
  name: string;
  route: TabRoute;
  icon: (active: boolean, ac: string, ic: string) => React.ReactNode;
  badge?: number;
}

// ── Component ──────────────────────────────────────────────────────────────────
function BottomTabNavigator() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const currentRoute = route.name;
  const { colors } = useTheme();
  const { cartCount } = useCart();
  const [role, setRole] = useState<string | null>(_cachedRole);
  const [, setCanCreateRetailers] = useState(_cachedCanCreateRetailers);
  const [, setCanCreateProducts] = useState(_cachedCanCreateProducts);
  const isSwitchingRef = useRef(false);

  // Read role only once per session
  useEffect(() => {
    if (_cachedRole) return;
    AsyncStorage.getItem('user').then((s) => {
      if (s) {
        const user = safeJsonParse<{
          role?: string;
          can_create_retailers?: unknown;
          can_create_products?: unknown;
        }>(s, {});
        const nextRole = user?.role ?? null;
        const nextCanCreateRetailers = hasCreateRetailerPermission(user?.can_create_retailers);
        const nextCanCreateProducts = hasCreateProductPermission(user?.can_create_products);
        _cachedRole = nextRole;
        _cachedCanCreateRetailers = nextCanCreateRetailers;
        _cachedCanCreateProducts = nextCanCreateProducts;
        setRole(nextRole);
        setCanCreateRetailers(nextCanCreateRetailers);
        setCanCreateProducts(nextCanCreateProducts);
      }
    });
  }, []);

  const activeColor = colors.primary;
  const inactiveColor = colors.textSecondary;

  const retailerTabs: TabItem[] = [
    {
      name: 'Dashboard',
      route: 'RetailerDashboard',
      icon: (a, ac, ic) => <MaterialIcons name="dashboard" size={24} color={a ? ac : ic} />,
    },
    {
      name: 'Products',
      route: 'RetailerHome',
      icon: (a, ac, ic) => <Ionicons name="grid-outline" size={24} color={a ? ac : ic} />,
    },
    {
      name: 'Cart',
      route: 'Cart',
      icon: (a, ac, ic) => <Feather name="shopping-cart" size={24} color={a ? ac : ic} />,
      badge: cartCount,
    },
    {
      name: 'Orders',
      route: 'RetailerOrderScreen',
      icon: (a, ac, ic) => <Feather name="package" size={24} color={a ? ac : ic} />,
    },
  ];

  const staffTabs: TabItem[] = [
    {
      name: 'Dashboard',
      route: 'StaffDashboard',
      icon: (a, ac, ic) => <MaterialIcons name="dashboard" size={24} color={a ? ac : ic} />,
    },
            {
              name: 'Customers',
              route: 'StaffScreen' as const,
              icon: (a: boolean, ac: string, ic: string) => (
                <Feather name="users" size={24} color={a ? ac : ic} />
              ),
            },
    {
      name: 'Cart',
      route: 'StaffCartScreen',
      icon: (a, ac, ic) => <Feather name="shopping-cart" size={24} color={a ? ac : ic} />,
      badge: cartCount,
    },
    {
      name: 'Orders',
      route: 'StaffOrderScreen',
      icon: (a, ac, ic) => <Feather name="package" size={24} color={a ? ac : ic} />,
    },
    {
      name: 'More',
      route: 'MoreScreen',
      icon: (a, ac, ic) => <Feather name="more-horizontal" size={24} color={a ? ac : ic} />,
    },
  ];

  // const dealerTabs = staffTabs.filter((tab) => tab.route !== 'StaffDashboard');
  const tabs = role === 'retailer' ? retailerTabs : role === 'staff' ? staffTabs : role === 'dealer' ? staffTabs : [];

  // Replace the current tab route so tab navigation stays a single-screen stack
  // while Native Stack performs a short fade between tab contents.
  const handleTabPress = useCallback(
    (tabRoute: TabRoute) => {
      if (currentRoute === tabRoute) return; // already here, do nothing
      if (isSwitchingRef.current) return;
      isSwitchingRef.current = true;

      navigation.replace(tabRoute);
      requestAnimationFrame(() => {
        isSwitchingRef.current = false;
      });
    },
    [navigation, currentRoute]
  );

  if (!role || (role !== 'retailer' && role !== 'staff' && role !== 'dealer')) return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: Platform.OS === 'ios' ? 20 : 8,
        paddingTop: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
        {tabs.map((tab) => {
          const isMoreChild = tab.route === 'MoreScreen' && currentRoute === 'ShareItems';
          const isActive = currentRoute === tab.route || isMoreChild;
          return (
            <TabButton
              key={tab.route}
              isActive={isActive}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
              badge={tab.badge}
              label={tab.name}
              onPress={() => handleTabPress(tab.route)}
              icon={tab.icon}
            />
          );
        })}
      </View>
    </View>
  );
}

const TabButton = memo(function TabButton({
  isActive,
  activeColor,
  inactiveColor,
  badge,
  label,
  onPress,
  icon,
}: {
  isActive: boolean;
  activeColor: string;
  inactiveColor: string;
  badge?: number;
  label: string;
  onPress: () => void;
  icon: (active: boolean, ac: string, ic: string) => React.ReactNode;
}) {
  const scale = useSharedValue(isActive ? 1 : 0.98);

  useEffect(() => {
    scale.value = withTiming(isActive ? 1 : 0.98, { duration: 180 });
  }, [isActive, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        minWidth: 60,
      }}
    >
      <Animated.View style={animatedStyle}>
        <View style={{ position: 'relative', alignItems: 'center' }}>
          {icon(isActive, activeColor, inactiveColor)}
          {badge !== undefined && badge > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -8,
                backgroundColor: '#ef4444',
                borderRadius: 9,
                minWidth: 18,
                height: 18,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 3,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                {badge > 99 ? '99+' : badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={{
            color: isActive ? activeColor : inactiveColor,
            fontSize: 10,
            marginTop: 4,
            fontWeight: isActive ? '700' : '500',
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

export default memo(BottomTabNavigator);
