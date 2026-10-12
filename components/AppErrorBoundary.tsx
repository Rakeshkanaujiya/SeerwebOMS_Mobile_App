import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OMS_COLORS } from '../src/lib/theme';
import { logScreenError } from '../src/lib/logging';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export default class AppErrorBoundary extends React.PureComponent<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logScreenError('AppErrorBoundary', error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>The app recovered from an unexpected screen error.</Text>
        <Pressable onPress={() => this.setState({ error: null })} style={styles.button}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: OMS_COLORS.primaryDeep,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: OMS_COLORS.textMuted,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    backgroundColor: OMS_COLORS.primary,
    borderRadius: 14,
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
