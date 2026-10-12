import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark';

interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryLight: string;
  success: string;
  warning: string;
  error: string;
  inputBg: string;
}

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const lightColors: ThemeColors = {
  background: '#eef7fb',
  surface: 'rgba(255,255,255,0.92)',
  card: 'rgba(255,255,255,0.94)',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#d9d1ef',
  primary: '#62518f',
  primaryLight: '#e8f9fe',
  success: '#14b8a6',
  warning: '#f59e0b',
  error: '#ef4444',
  inputBg: '#ffffff',
};

const darkColors: ThemeColors = {
  background: '#111827',
  surface: '#1f2937',
  card: '#374151',
  text: '#f9fafb',
  textSecondary: '#9ca3af',
  border: '#4b5563',
  primary: '#60a5fa',
  primaryLight: '#1e3a5f',
  success: '#34d399',
  warning: '#fbbf24',
  error: '#f87171',
  inputBg: '#374151',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setMode(savedTheme);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const toggleTheme = async () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    await AsyncStorage.setItem('theme', newMode);
  };

  const setTheme = async (newMode: ThemeMode) => {
    setMode(newMode);
    await AsyncStorage.setItem('theme', newMode);
  };

  const colors = mode === 'light' ? lightColors : darkColors;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
