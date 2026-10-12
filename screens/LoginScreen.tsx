import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ImageBackground,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';
import { apiUrl } from 'apiurl';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';

import { getErrorMessage, getHomeRouteForRole } from '../src/lib/app';
import {
  hydrateStaffCreateCustomerPermission,
  refreshAuthenticatedUser,
} from '../src/lib/auth';
import { CART_USER_CHANGED_EVENT } from '../context/CartContext';
import { clearRoleCache } from 'components/BottomTabNavigator';
import { loadProductSettings } from '../src/lib/dealerSettings';

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getDealerIdForSettings(user: any) {
  return String(user?.role === 'dealer' ? user?.id ?? '' : user?.dealer_id ?? '');
}

async function preloadProductSettingsForUser(user: any, token: string) {
  const dealerId = getDealerIdForSettings(user);
  if (!dealerId) return;
  await loadProductSettings(dealerId, token).catch(() => undefined);
}

function getNetworkLoginErrorMessage(error: unknown) {
  const message = getErrorMessage(error);
  if (/network request failed/i.test(message)) {
    return `Cannot reach the API server at ${apiUrl}. Check that the phone/emulator can access this URL.`;
  }
  return message;
}

export default function LoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [showPassword, setShowPassword] = useState(false);
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const completeLogin = async (data: any) => {
    if (!data?.token || !data?.user) {
      setErrorMessage('Login response is missing account details.');
      return;
    }

    await AsyncStorage.setItem('token', data.token);

    let authenticatedUser = data.user;
    try {
      authenticatedUser = await refreshAuthenticatedUser(data.token, data.user);
    } catch (error) {
      authenticatedUser = await hydrateStaffCreateCustomerPermission(data.user, data.token);
      await AsyncStorage.setItem('user', JSON.stringify(authenticatedUser));
      console.warn('Failed to refresh user profile after login:', error);
    }

    await preloadProductSettingsForUser(authenticatedUser, data.token);

    const route = getHomeRouteForRole(authenticatedUser?.role);

    if (!route) {
      setErrorMessage('This account role is not supported in the current mobile app.');
      return;
    }

    clearRoleCache();
    EventRegister.emit(CART_USER_CHANGED_EVENT, authenticatedUser.id);

    navigation.reset({
      index: 0,
      routes: [{ name: route }],
    });
  };

  const handleLogin = async () => {
    if (loading) return;
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Enter both username and password.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const response = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await parseJsonResponse(response);

      if (response.ok && data.message === 'Login successful') {
        await completeLogin(data);
      } else {
        setErrorMessage(data.message || 'Invalid username, email, mobile number or password.');
      }
    } catch (error) {
      setErrorMessage(getNetworkLoginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (loading) return;
    if (!mobile.trim()) {
      setErrorMessage('Enter your registered mobile number.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const response = await fetch(`${apiUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: mobile }),
      });

      const data = await parseJsonResponse(response);

      if (response.ok) {
        setOtpSent(true);
        setErrorMessage(data.otp ? `Development OTP: ${data.otp}` : '');
      } else {
        setErrorMessage(data.message || 'Unable to send OTP.');
      }
    } catch (error) {
      setErrorMessage(getNetworkLoginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpLogin = async () => {
    if (loading) return;
    if (!mobile.trim() || !otp.trim()) {
      setErrorMessage('Enter mobile number and OTP.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const response = await fetch(`${apiUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: mobile, otp }),
      });

      const data = await parseJsonResponse(response);

      if (response.ok && data.message === 'Login successful') {
        await completeLogin(data);
      } else {
        setErrorMessage(data.message || 'Invalid or expired OTP.');
      }
    } catch (error) {
      setErrorMessage(getNetworkLoginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Background Image */}
      <ImageBackground
        source={require('../assets/images/login_mobile.png')}
        style={styles.bgImage}
        imageStyle={styles.bgImageStyle}
        resizeMode="cover"
      />

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        extraScrollHeight={36}
      >
          {/* Login Container */}
          <View style={styles.container}>
            {/* Logo */}
            <Animated.View
              entering={FadeInUp.delay(200).duration(500).springify()}
              style={styles.logoWrapper}
            >
              <Image
                source={require('../assets/icon.png')}
                style={styles.logo}
                resizeMode="cover"
              />
            </Animated.View>

            <View style={[styles.modeTabs, { display: 'none' }]}>
              <Pressable
                disabled={loading}
                onPress={() => setLoginMode('password')}
                style={[styles.modeTab, loginMode === 'password' && styles.modeTabActive]}
              >
                <Text style={[styles.modeTabText, loginMode === 'password' && styles.modeTabTextActive]}>Password</Text>
              </Pressable>
              <Pressable
                disabled={loading}
                onPress={() => setLoginMode('otp')}
                style={[styles.modeTab, loginMode === 'otp' && styles.modeTabActive]}
              >
                <Text style={[styles.modeTabText, loginMode === 'otp' && styles.modeTabTextActive]}>OTP</Text>
              </Pressable>
            </View>

            {loginMode === 'password' ? (
            <>
            {/* Username Input */}
            <Animated.View
              entering={FadeInDown.delay(200).duration(1500).springify()}
              style={styles.inputWrapper}
            >
              <TextInput
                placeholder="Username, email or mobile number"
                style={styles.input}
                placeholderTextColor="rgba(0,0,0,0.4)"
                value={username}
                onChangeText={setUsername}
                editable={!loading}
                autoCapitalize="none"
              />
            </Animated.View>
            </>
            ) : (
            <>
            <Animated.View
              entering={FadeInDown.delay(200).duration(1500).springify()}
              style={styles.inputWrapper}
            >
              <TextInput
                placeholder="Registered mobile number"
                style={styles.input}
                placeholderTextColor="rgba(0,0,0,0.4)"
                value={mobile}
                onChangeText={(value) => {
                  setMobile(value);
                  setOtpSent(false);
                  setOtp('');
                }}
                editable={!loading}
                keyboardType="phone-pad"
              />
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(300).duration(1500).springify()}
              style={styles.inputWrapper}
            >
              <TextInput
                placeholder="6 digit OTP"
                style={styles.input}
                placeholderTextColor="rgba(0,0,0,0.4)"
                value={otp}
                onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
                editable={!loading && otpSent}
                keyboardType="number-pad"
                maxLength={6}
              />
            </Animated.View>
            </>
            )}

            {loginMode === 'password' && (
            /* Password Input */
            <Animated.View
              entering={FadeInDown.delay(300).duration(1500).springify()}
              style={styles.passwordWrapper}
            >
              <TextInput
                placeholder="Password"
                style={styles.passwordInput}
                secureTextEntry={!showPassword}
                placeholderTextColor="rgba(0,0,0,0.4)"
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
                style={styles.eyeBtn}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#888"
                />
              </Pressable>
            </Animated.View>
            )}

            {/* Error Message */}
            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            {/* Login Button */}
            <Animated.View
              entering={FadeInDown.delay(400).duration(1500).springify()}
            >
              <Pressable
                disabled={loading}
                onPress={loginMode === 'password' ? handleLogin : otpSent ? handleOtpLogin : handleRequestOtp}
                style={[
                  styles.loginBtn,
                  { backgroundColor: loading ? '#7f92f5' : '#5b74f1' },
                ]}
              >
                <View style={styles.loginBtnInner}>
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.loginBtnText}>Signing In...</Text>
                    </>
                  ) : (
                    <Text style={styles.loginBtnText}>
                      {loginMode === 'password' ? 'Login' : otpSent ? 'Verify OTP & Login' : 'Send OTP'}
                    </Text>
                  )}
                </View>
              </Pressable>
            </Animated.View>

            {/* Bottom Text */}
            <Animated.View
              entering={FadeInDown.delay(500).duration(1500).springify()}
              style={styles.bottomTextWrapper}
            >
              <Text style={styles.bottomText}>
                Don&apos;t have your login details? Please contact your dealer.
              </Text>
            </Animated.View>
          </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bgImageStyle: {
    opacity: 0.2,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  container: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderRadius: 16,
    marginBottom: 32,
  },
  logoWrapper: {
    width: 112,
    height: 112,
    borderRadius: 56,
    marginTop: 24,
    marginBottom: 24,
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: '#5b74f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    backgroundColor: '#5b74f1',
  },
  modeTabText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  modeTabTextActive: {
    color: '#fff',
  },
  inputWrapper: {
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    color: '#000',
    fontSize: 15,
  },
  passwordWrapper: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  passwordInput: {
    flex: 1,
    color: '#000',
    fontSize: 15,
  },
  eyeBtn: {
    padding: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
    marginBottom: 4,
  },
  loginBtn: {
    borderRadius: 16,
    paddingVertical: 12,
    marginTop: 24,
    height: 56,
    justifyContent: 'center',
    shadowColor: '#5b74f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loginBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  bottomTextWrapper: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  bottomText: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'center',
    borderRadius: 8,
    width: '90%',
    color: '#374151',
    fontSize: 13,
    lineHeight: 20,
  },
});
