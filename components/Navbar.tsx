import React, { memo, useCallback, useState } from 'react';
import { View, Text, Pressable, Modal, Image, StyleSheet } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { clearRoleCache } from './BottomTabNavigator';
import { clearCache } from '../src/lib/services/api';
import { EventRegister } from 'react-native-event-listeners';
import { CART_USER_CHANGED_EVENT, getCartStorageKey } from '../context/CartContext';
import { OMS_COLORS } from '../src/lib/theme';

interface NavbarProps {
  user?: string;
}

const NAVBAR_BACKGROUND = '#FFFFFF';

function Navbar({ user }: NavbarProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [menuVisible, setMenuVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);

  const closeMenu = useCallback(() => setMenuVisible(false), []);
  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  const goToProfile = useCallback(() => {
    setMenuVisible(false);
    // Wait for the modal's fade-out animation to finish before navigating
    setTimeout(() => navigation.navigate('Profile'), 10);
  }, [navigation]);
  const handleLogout = useCallback(async () => {
    const storedUser = await AsyncStorage.getItem('user');
    const userId = storedUser ? JSON.parse(storedUser)?.id : null;
    await AsyncStorage.multiRemove([
      'user',
      'token',
      'cart',
      getCartStorageKey(userId),
      'selectedRetailer',
      'welcomeShown',
    ]);
    EventRegister.emit(CART_USER_CHANGED_EVENT, null);
    clearCache();
    clearRoleCache();
    setLogoutVisible(false);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, [navigation]);

  return (
    <View style={styles.navbar}>
      <View style={styles.brand}>
        <View style={styles.logoFrame}>
          <Image
            source={require('../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Seerweb OMS</Text>
        </View>
      </View>

      <Pressable onPress={() => setMenuVisible(true)} hitSlop={10} style={styles.menuButton}>
        <Ionicons name="ellipsis-vertical" size={20} color={OMS_COLORS.primaryDeep} />
      </Pressable>

      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} onPress={closeMenu}>
          <View
            style={{
              position: 'absolute',
              top: 60,
              right: 16,
              backgroundColor: '#fff',
              borderRadius: 12,
              width: 200,
              elevation: 6,
              borderWidth: 1,
              borderColor: OMS_COLORS.primaryBorder,
            }}>
            <Pressable
              onPress={goToProfile}
              style={{ flexDirection: 'row', padding: 14, alignItems: 'center' }}>
              <Ionicons name="person-outline" size={18} color={OMS_COLORS.primary} />
              <Text style={{ marginLeft: 12, fontWeight: '600', color: OMS_COLORS.primaryDeep }}>Profile</Text>
            </Pressable>
            <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
            <Pressable
              onPress={() => {
                setMenuVisible(false);
                setLogoutVisible(true);
              }}
              style={{ flexDirection: 'row', padding: 14, alignItems: 'center' }}>
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              <Text style={{ marginLeft: 12, fontWeight: '500', color: '#ef4444' }}>Logout</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={logoutVisible} transparent animationType="fade" onRequestClose={closeLogout}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
            paddingHorizontal: 16,
          }}>
          <View
            style={{
              backgroundColor: '#fff',
              width: '100%',
              maxWidth: 360,
              borderRadius: 20,
              padding: 20,
            }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View
                style={{
                  backgroundColor: '#fee2e2',
                  padding: 12,
                  borderRadius: 50,
                  marginBottom: 12,
                }}>
                <Feather name="log-out" size={28} color="#ef4444" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>Logout</Text>
              <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 6 }}>
                Are you sure you want to logout?
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={closeLogout}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  backgroundColor: '#e5e7eb',
                  borderRadius: 12,
                  alignItems: 'center',
                }}>
                <Text style={{ fontWeight: '600', color: '#374151' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleLogout}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  backgroundColor: '#ef4444',
                  borderRadius: 12,
                  alignItems: 'center',
                }}>
                <Text style={{ fontWeight: '600', color: '#fff' }}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: NAVBAR_BACKGROUND,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: OMS_COLORS.border,
  },
  brand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoFrame: {
    width: 46,
    height: 46,
    marginRight: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVBAR_BACKGROUND,
  },
  logo: {
    width: 94,
    height: 94,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    lineHeight: 26, 
    fontWeight: '800',
    letterSpacing: 0.1,
    color: OMS_COLORS.primaryDeep,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});

export default memo(Navbar);

// modify the square white background to circle and in the video on first stage the default react native logo apears remove that one and also remove second splash screeen which is second image one and while app apear add lottie animation effect while open the app show the last splash animated zoom in zoom out icon and in the background sprade theme blue color from top right corner to hole screeen on loading state