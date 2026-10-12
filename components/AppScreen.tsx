import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OMS_COLORS } from '../src/lib/theme';

interface AppScreenProps {
  children: React.ReactNode;
  edges?: Array<'top' | 'right' | 'bottom' | 'left'>;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function AppScreen({
  children,
  edges = ['top'],
  style,
  contentStyle,
}: AppScreenProps) {
  return (
    <LinearGradient
      colors={[OMS_COLORS.backgroundTop, OMS_COLORS.accent, '#F7FBFF']}
      locations={[0, 0.38, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ flex: 1 }, style]}>
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      </SafeAreaView>
    </LinearGradient>
  );
}
