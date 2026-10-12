import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  rows?: number;
};

export default function ScreenSkeleton({ rows = 4 }: Props) {
  return (
    <View style={styles.container}>
      <View style={[styles.block, styles.hero]} />
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.card}>
          <View style={[styles.block, styles.lineWide]} />
          <View style={[styles.block, styles.line]} />
          <View style={styles.row}>
            <View style={[styles.block, styles.chip]} />
            <View style={[styles.block, styles.chip]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 20,
  },
  block: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: 14,
  },
  hero: {
    height: 82,
    marginBottom: 14,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.54)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  lineWide: {
    height: 18,
    width: '70%',
  },
  line: {
    height: 14,
    marginTop: 10,
    width: '46%',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    height: 28,
    width: 84,
  },
});
