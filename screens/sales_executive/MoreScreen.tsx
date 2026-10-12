import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import AppScreen from '../../components/AppScreen';
import BottomTabNavigator from '../../components/BottomTabNavigator';
import Navbar from '../../components/Navbar';
import type { RootStackParamList } from '../../types/navigation';
import { canCreateCustomersForUser } from '../../src/lib/customers';
import { canManageProductsForUser } from '../../src/lib/permissions';
import { OMS_COLORS } from '../../src/lib/theme';
import { safeJsonParse } from '../../src/lib/app';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface MoreAction {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

export default function MoreScreen() {
  const navigation = useNavigation<Nav>();
  const [user, setUser] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem('user').then((value) => {
      if (!cancelled) setUser(safeJsonParse<Record<string, any> | null>(value, null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const actions = useMemo<MoreAction[]>(() => {
    const next: MoreAction[] = [
      {
        key: 'share-items',
        title: 'Share Items',
        description: 'Select products and share item cards from your device.',
        icon: 'share-social-outline',
        color: OMS_COLORS.primary,
        onPress: () => navigation.navigate('ShareItems'),
      },
    ];

    if (canManageProductsForUser(user)) {
      next.unshift({
        key: 'create-item',
        title: 'Create Item Master',
        description: 'Add a product with images, colors, sizes, and rates.',
        icon: 'cube-outline',
        color: OMS_COLORS.accentDark,
        onPress: () => navigation.navigate('CreateItemMaster', { returnTo: 'StaffScreen' }),
      });
    }

    if (canCreateCustomersForUser(user)) {
      next.splice(canManageProductsForUser(user) ? 1 : 0, 0, {
        key: 'create-customer',
        title: 'Create Customer',
        description: 'Create a new retailer account and contact profile.',
        icon: 'person-add-outline',
        color: OMS_COLORS.success,
        onPress: () => navigation.navigate('CreateCustomer', { returnTo: 'StaffScreen' }),
      });
    }

    return next;
  }, [navigation, user]);

  const renderAction = useCallback((action: MoreAction) => (
    <Pressable
      key={action.key}
      onPress={action.onPress}
      accessibilityRole="button"
      android_ripple={{ color: 'rgba(98,81,143,0.10)' }}
      style={styles.actionCard}>
      <View style={[styles.actionIcon, { backgroundColor: `${action.color}18` }]}>
        <Ionicons name={action.icon} size={24} color={action.color} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionDescription}>{action.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={OMS_COLORS.textSubtle} />
    </Pressable>
  ), []);

  return (
    <AppScreen>
      <Navbar />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Actions</Text>
          {actions.map(renderAction)}
        </View>
      </ScrollView>
      <BottomTabNavigator />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 110,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
    padding: 16,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: OMS_COLORS.primary,
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionCard: {
    alignItems: 'center',
    backgroundColor: OMS_COLORS.surfaceTint,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 12,
    minHeight: 92,
    padding: 14,
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  actionText: {
    flex: 1,
    gap: 4,
  },
  actionTitle: {
    color: OMS_COLORS.primaryDeep,
    fontSize: 16,
    fontWeight: '900',
  },
  actionDescription: {
    color: OMS_COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
