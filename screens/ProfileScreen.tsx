import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Switch,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import BottomTabNavigator, { clearRoleCache } from 'components/BottomTabNavigator';
import { useTheme } from '../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import Navbar from 'components/Navbar';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import { apiUrl } from 'apiurl';
import { EventRegister } from 'react-native-event-listeners';
import { CART_USER_CHANGED_EVENT, getCartStorageKey } from '../context/CartContext';

interface NotificationSettings {
  orderUpdates: boolean;
  promotions: boolean;
  newProducts: boolean;
  reminders: boolean;
}

interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  ledger?: string;
}

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { mode, colors, toggleTheme } = useTheme();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editField, setEditField] = useState<'name' | 'email' | 'phone' | 'password'>('name');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [notifications, setNotifications] = useState<NotificationSettings>({
    orderUpdates: true,
    promotions: false,
    newProducts: true,
    reminders: true,
  });

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    loadUserData();
    loadNotificationSettings();
  }, []);

  const loadUserData = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };
// Rate should get update from last party sales order & item details

// fetch and save the sales from tally to oms database for the new task.. below

// the items have thier price or rate but sometime the dealer may change the rate for the items according to thier retailers or custiomers which is available in the sales in tally in the 
  const loadNotificationSettings = async () => {
    try {
      const settings = await AsyncStorage.getItem('notificationSettings');
      if (settings) setNotifications(JSON.parse(settings));
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  };

  const saveNotificationSettings = async (newSettings: NotificationSettings) => {
    try {
      await AsyncStorage.setItem('notificationSettings', JSON.stringify(newSettings));
      setNotifications(newSettings);
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  };

  const handleEditProfile = (field: 'name' | 'email' | 'phone' | 'password') => {
    setEditField(field);
    setCurrentPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setEditValue(field === 'password' ? '' : user?.[field] || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim()) { Alert.alert('Error', 'Please enter a value'); return; }
    if (editField === 'password') {
      if (editValue.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
      if (editValue !== confirmPassword) { Alert.alert('Error', 'Passwords do not match'); return; }
    }
    if (editField === 'email' && !editValue.includes('@')) { Alert.alert('Error', 'Please enter a valid email'); return; }
    setSaving(true);
    try {
      if (user && editField !== 'password') {
        const updatedUser = { ...user, [editField]: editValue.trim() };
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
      Alert.alert('Success', `${editField === 'password' ? 'Password' : 'Profile'} updated successfully`);
      setEditModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      const userId = user?.id ?? null;
      await AsyncStorage.multiRemove([
        'user',
        'token',
        'cart',
        getCartStorageKey(userId),
        'selectedRetailer',
      ]);
      EventRegister.emit(CART_USER_CHANGED_EVENT, null);
      clearRoleCache();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch {
      Alert.alert('Error', 'Failed to logout');
    }
  };

  const handleCallSupport = () => Linking.openURL('tel:+918108022420');

  const getFieldLabel = (field: string) => {
    switch (field) {
      case 'name': return 'Full Name';
      case 'email': return 'Email Address';
      case 'phone': return 'Phone Number';
      case 'password': return 'New Password';
      default: return field;
    }
  };

  const changePassword = async () => {
    try {
      if (!user) { Alert.alert('Error', 'User not found. Please login again.'); return; }
      if (!currentPassword || !editValue || !confirmPassword) { Alert.alert('Error', 'All password fields are required'); return; }
      if (editValue !== confirmPassword) { Alert.alert('Error', 'New password and confirm password do not match'); return; }
      setSaving(true);
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${apiUrl}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: user.id, current_password: currentPassword, new_password: editValue }),
      });
      const data = await response.json();
      if (!response.ok) { Alert.alert('Error', data.message || 'Password change failed'); return; }
      Alert.alert('Success', 'Password changed successfully');
      setCurrentPassword(''); setEditValue(''); setConfirmPassword('');
      setEditModalVisible(false);
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
      <Navbar user={user?.name} />
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        extraScrollHeight={36}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={[styles.headerTitle, { color: '#FFFFFF' }]}>Settings</Text>
          <Text style={[styles.headerSubtitle, { color: 'rgba(255,255,255,0.82)' }]}>
            Manage your account and preferences
          </Text>
        </View>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.profileCardInner}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {user?.name || 'User'}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
                {user?.email || 'email@example.com'}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.roleText, { color: colors.primary }]}>
                  {user?.role || 'User'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ACCOUNT</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

            <Pressable
              style={[styles.menuRow, styles.menuRowBorder, { borderColor: colors.border }]}
              onPress={() => handleEditProfile('name')}
            >
              <View style={[styles.menuIcon, { backgroundColor: colors.primaryLight }]}>
                <Feather name="user" size={18} color={colors.primary} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>Full Name</Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{user?.name || 'Not set'}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.menuRow, styles.menuRowBorder, { borderColor: colors.border }]}
              onPress={() => handleEditProfile('email')}
            >
              <View style={[styles.menuIcon, { backgroundColor: '#fef3c7' }]}>
                <Feather name="mail" size={18} color="#f59e0b" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>Email Address</Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{user?.email || 'Not set'}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.menuRow, styles.menuRowBorder, { borderColor: colors.border }]}
              onPress={() => handleEditProfile('phone')}
            >
              <View style={[styles.menuIcon, { backgroundColor: '#d1fae5' }]}>
                <Feather name="phone" size={18} color="#10b981" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>Phone Number</Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{user?.phone || 'Not set'}</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.menuRow}
              onPress={() => handleEditProfile('password')}
            >
              <View style={[styles.menuIcon, { backgroundColor: '#fee2e2' }]}>
                <Feather name="lock" size={18} color="#ef4444" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>Change Password</Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>Update your password</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Help & Support Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>HELP & SUPPORT</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable style={styles.menuRow} onPress={handleCallSupport}>
              <View style={[styles.menuIcon, { backgroundColor: '#d1fae5' }]}>
                <Feather name="phone-call" size={18} color="#10b981" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>Call Support</Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>+91 8108022420</Text>
              </View>
              <Feather name="external-link" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ABOUT</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.menuRow}>
              <View style={[styles.menuIcon, { backgroundColor: '#e0e7ff' }]}>
                <MaterialIcons name="info-outline" size={18} color="#6366f1" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>App Version</Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>v{appVersion}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <Pressable
          style={styles.logoutBtn}
          onPress={() => setLogoutModalVisible(true)}
        >
          <Feather name="log-out" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>

        <View style={{ height: 16 }} />
      </KeyboardAwareScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAwareScrollView contentContainerStyle={styles.modalOverlay} extraScrollHeight={36}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Edit {getFieldLabel(editField)}
            </Text>

            {editField !== 'password' && (
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                placeholder={getFieldLabel(editField)}
                placeholderTextColor={colors.textSecondary}
                value={editValue}
                onChangeText={setEditValue}
                keyboardType={editField === 'email' ? 'email-address' : editField === 'phone' ? 'phone-pad' : 'default'}
                autoCapitalize={editField === 'email' ? 'none' : 'words'}
              />
            )}

            {editField === 'password' && (
              <>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.inputPassword, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="Enter Current Password"
                    placeholderTextColor={colors.textSecondary}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry={!showCurrentPassword}
                  />
                  <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                    <Ionicons name={showCurrentPassword ? 'eye-off' : 'eye'} size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.inputPassword, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="New Password"
                    placeholderTextColor={colors.textSecondary}
                    value={editValue}
                    onChangeText={setEditValue}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.inputPassword, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="Confirm Password"
                    placeholderTextColor={colors.textSecondary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                    <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.border }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={editField === 'password' ? changePassword : handleSaveEdit}
                disabled={saving}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>{saving ? 'Saving...' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <KeyboardAwareScrollView contentContainerStyle={styles.modalOverlay} extraScrollHeight={36}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.logoutModalContent}>
              <View style={styles.logoutIconWrapper}>
                <Feather name="log-out" size={28} color="#ef4444" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Logout</Text>
              <Text style={[styles.logoutModalText, { color: colors.textSecondary }]}>
                Are you sure you want to logout? You&apos;ll need to login again to access your account.
              </Text>
            </View>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.border }]}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#ef4444' }]}
                onPress={handleLogout}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      <BottomTabNavigator />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Header
  headerContainer: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },

  // Profile Card
  profileCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  profileCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 4,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Menu Row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
  },
  menuIcon: {
    padding: 8,
    borderRadius: 12,
    marginRight: 12,
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    fontWeight: '500',
    fontSize: 15,
  },
  menuSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },

  // Logout
  logoutBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#ef4444',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 15,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  passwordRow: {
    position: 'relative',
    marginBottom: 12,
  },
  inputPassword: {
    paddingRight: 48,
    marginBottom: 0,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnText: {
    fontWeight: '600',
    fontSize: 15,
  },

  // Logout modal
  logoutModalContent: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoutIconWrapper: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 999,
    marginBottom: 12,
  },
  logoutModalText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
});
