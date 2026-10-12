import 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import './global.css';
import type { RootStackParamList } from 'types/navigation';
import { ImageBackground, Image, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { CartProvider } from './context/CartContext';
import { OMS_COLORS } from './src/lib/theme';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import LottieView from 'lottie-react-native';
import AppErrorBoundary from './components/AppErrorBoundary';

import AuthLoadingScreen from './screens/AuthLoadingScreen';
import LoginScreen from './screens/LoginScreen';
import AboutScreen from './screens/AboutScreen';
import ContactScreen from './screens/ContactScreen';
import ProfileScreen from './screens/ProfileScreen';
import RetailerDashboardScreen from './screens/retailer/RetailerDashboard';
import RetailerHomeScreen from './screens/retailer/RetailerHome';
import CartScreen from './screens/CartScreen';
import StaffCartScreen from './screens/StaffCartScreen';
import RetailerOrderScreen from './screens/retailer/RetailerOrderScreen';
import StaffScreen from './screens/sales_executive/StaffScreen';
import StaffDashboard from './screens/sales_executive/StaffDashboard';
import StaffOrderScreen from './screens/sales_executive/StaffOrderScreen';
import CreateCustomerScreen from './screens/sales_executive/CreateCustomerScreen';
import CreateItemMasterScreen from './screens/sales_executive/CreateItemMasterScreen';
import MoreScreen from './screens/sales_executive/MoreScreen';
import ShareItemsScreen from './screens/sales_executive/ShareItemsScreen';
import ProductDetailsScreen from './screens/ProductDetailsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const MyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: OMS_COLORS.background,
  },
};

const tabScreenOptions = {
  animation: 'fade' as const,
  animationDuration: 180,
  contentStyle: { backgroundColor: 'transparent' },
};

function SplashOverlay({ onAnimationFinish }: { onAnimationFinish: () => void }) {
  const logoScale = useSharedValue(0.84);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSequence(
      withTiming(1.08, { duration: 760, easing: Easing.out(Easing.cubic) }),
      withTiming(0.96, { duration: 620, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) })
    );
  }, [logoOpacity, logoScale]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <Animated.View
      exiting={FadeOut.duration(220)}
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: OMS_COLORS.background,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        },
      ]}
    >
      <LottieView
        source={require('./assets/seerweb-splash.json')}
        autoPlay
        loop={false}
        onAnimationFinish={onAnimationFinish}
        resizeMode="cover"
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[styles.splashLogoShadow, logoStyle]}>
        <View style={styles.splashLogoCircle}>
          <Image source={require('./assets/icon.png')} style={styles.splashLogo} resizeMode="contain" />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function AppContent() {
  const { mode } = useTheme();
  const [startupReady, setStartupReady] = useState(false);
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashAnimationDone(true), 2600);
    return () => clearTimeout(timer);
  }, []);

  const handleStartupReady = useCallback(() => {
    setStartupReady(true);
  }, []);

  const handleSplashAnimationFinish = useCallback(() => {
    setSplashAnimationDone(true);
  }, []);

  const showSplash = !startupReady || !splashAnimationDone;

  return (
    <LinearGradient
      colors={[OMS_COLORS.backgroundTop, OMS_COLORS.accent, '#F7FBFF']}
      locations={[0, 0.38, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <ImageBackground
        source={require('./assets/images/bga.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        imageStyle={{ opacity: 0.1 }}
      />
      <StatusBar style="light" />

      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor:
              mode === 'dark'
                ? 'rgba(0,0,0,0.65)'
                : 'rgba(255,255,255,0.08)',
          },
        ]}
      />

      <NavigationContainer theme={MyTheme}>
        <AppErrorBoundary>
          <Stack.Navigator
            initialRouteName="AuthLoading"
            screenOptions={{
              headerShown: false,
              animation: 'none',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          >
            <Stack.Screen name="AuthLoading">
              {() => <AuthLoadingScreen onReady={handleStartupReady} />}
            </Stack.Screen>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen
              name="RetailerDashboard"
              component={RetailerDashboardScreen}
              options={tabScreenOptions}
            />
            <Stack.Screen
              name="RetailerHome"
              component={RetailerHomeScreen}
              options={tabScreenOptions}
            />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen name="Contact" component={ContactScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Cart" component={CartScreen} options={tabScreenOptions} />
            <Stack.Screen
              name="StaffCartScreen"
              component={StaffCartScreen}
              options={tabScreenOptions}
            />
            <Stack.Screen
              name="RetailerOrderScreen"
              component={RetailerOrderScreen}
              options={tabScreenOptions}
            />
            <Stack.Screen
              name="StaffDashboard"
              component={StaffDashboard}
              options={tabScreenOptions}
            />
            <Stack.Screen name="StaffScreen" component={StaffScreen} options={tabScreenOptions} />
            <Stack.Screen name="MoreScreen" component={MoreScreen} options={tabScreenOptions} />
            <Stack.Screen name="ShareItems" component={ShareItemsScreen} options={tabScreenOptions} />
            <Stack.Screen
              name="CreateCustomer"
              component={CreateCustomerScreen}
              options={tabScreenOptions}
            />
            <Stack.Screen
              name="CreateItemMaster"
              component={CreateItemMasterScreen}
              options={tabScreenOptions}
            />
            <Stack.Screen
              name="StaffOrderScreen"
              component={StaffOrderScreen}
              options={tabScreenOptions}
            />
            <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
          </Stack.Navigator>
        </AppErrorBoundary>
      </NavigationContainer>

      {showSplash ? <SplashOverlay onAnimationFinish={handleSplashAnimationFinish} /> : null}
    </LinearGradient>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CartProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </CartProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashLogoShadow: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  splashLogoCircle: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  splashLogo: {
    width: 330,
    height: 330,
  },
});
