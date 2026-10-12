// screens/AuthLoadingScreen.tsx

import React, { useEffect } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { getHomeRouteForRole, safeJsonParse } from '../src/lib/app';
import { refreshAuthenticatedUser } from '../src/lib/auth';
import { clearRoleCache } from 'components/BottomTabNavigator';
import { loadProductSettings } from '../src/lib/dealerSettings';

function getDealerIdForSettings(user: any) {
  return String(user?.role === 'dealer' ? user?.id ?? '' : user?.dealer_id ?? '');
}

async function preloadProductSettingsForUser(user: any, token: string) {
  const dealerId = getDealerIdForSettings(user);
  if (!dealerId) return;
  await loadProductSettings(dealerId, token).catch(() => undefined);
}

type AuthLoadingScreenProps = {
  onReady?: () => void;
};

export default function AuthLoadingScreen({ onReady }: AuthLoadingScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    const checkAuth = async () => {
      const [token, userString] = await Promise.all([
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('user'),
      ]);

      if (!token || !userString) {
        onReady?.();
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      const storedUser = safeJsonParse<{ role?: string }>(userString, {});
      let user = storedUser;

      try {
        user = await refreshAuthenticatedUser(token, storedUser);
        await preloadProductSettingsForUser(user, token);
        clearRoleCache();
      } catch {
        await AsyncStorage.multiRemove(['token', 'user']);
        onReady?.();
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      const route = getHomeRouteForRole(user.role);

      onReady?.();
      navigation.reset({
        index: 0,
        routes: [{ name: route ?? 'Login' }],
      });
    };

    checkAuth();
  }, [navigation, onReady]);

  return <View className="flex-1 bg-[#EEF7FB]" />;
}


// update products cart as per business type, currently user select anyone size from the cart and add to summary cart or can add sets to cart but user should able to select multiple sizes like in the image
