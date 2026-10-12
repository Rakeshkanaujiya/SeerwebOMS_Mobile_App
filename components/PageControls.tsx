import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { OMS_COLORS } from '../src/lib/theme';

export default function PageControls({ page, total, hasMore, loading, go, refresh }: {
  page: number; total: number; hasMore: boolean; loading: boolean; go: (page: number) => void; refresh: () => void;
}) {
  return <View style={{ paddingVertical: 16, gap: 10 }}>
    <Text style={{ textAlign: 'center' }}>{total} results · Page {page}</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
      {[['Previous', () => go(page - 1), page <= 1], ['Refresh', refresh, false], ['Next', () => go(page + 1), !hasMore]].map(([label, action, disabled]) =>
        <Pressable key={String(label)} accessibilityRole="button" disabled={loading || Boolean(disabled)} onPress={action as () => void}
          style={{ padding: 12, opacity: loading || disabled ? 0.4 : 1 }}>
          <Text style={{ color: OMS_COLORS.primary, fontWeight: '700' }}>{String(label)}</Text>
        </Pressable>)}
    </View>
  </View>;
}
