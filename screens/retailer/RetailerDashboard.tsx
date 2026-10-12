/**
 * RetailerDashboard — with screenDataCache
 * Same caching pattern as StaffDashboard — instant remount, silent background refresh.
 */
import React, { useEffect, useState, useMemo, memo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import RefreshWrapper from 'components/RefreshWrapper';
import BottomTabNavigator, { screenDataCache } from 'components/BottomTabNavigator';
import Svg, { Path, G, Text as SvgText, Circle, Line } from 'react-native-svg';
import { Ionicons, Feather } from '@expo/vector-icons';
import Navbar from 'components/Navbar';
import { apiGet, cachedGet } from '../../src/lib/services/api';
import AppScreen from '../../components/AppScreen';
import { OMS_COLORS } from '../../src/lib/theme';

const CACHE_KEY = 'RetailerDashboard';

interface ApiOrder { id: number; items?: any[]; createdAt: string; status: string; total: string | number }

type RetailerDashboardSummary = {
  total: number;
  pending: number;
  approved: number;
  delivered: number;
  orderTrends: { month: string; value: number }[];
  recent: { id: number; items: number; date: string; total: number; status: string }[];
};

// ── StatCard ──────────────────────────────────────────────────────────────────
const StatCard = memo(({ title, value, icon, bgColor, change }: {
  title: string; value: number | string; icon: React.ReactNode; bgColor: string; change?: number;
}) => {
  const pos = change === undefined || change >= 0;
  const cc = pos ? '#10b981' : '#ef4444';
  return (
    <View style={styles.statCard}>
      <View style={styles.statRow}>
        <Text style={styles.statTitle} numberOfLines={1}>{title}</Text>
        <View style={[styles.statIcon, { backgroundColor: bgColor }]}>{icon}</View>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {change !== undefined && (
        <View style={styles.changeRow}>
          <View style={[styles.changeBadge, { backgroundColor: pos ? '#d1fae5' : '#fee2e2' }]}>
            <Text style={[styles.changeText, { color: cc }]}>{pos ? '↑ +' : '↓ '}{change.toFixed(1)}%</Text>
          </View>
          <Text style={styles.changeLabel}>vs last month</Text>
        </View>
      )}
    </View>
  );
});

// ── DonutChart ────────────────────────────────────────────────────────────────
const DonutChart = memo(({ data, size }: { data: { label: string; value: number; color: string }[]; size: number }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - 20, ir = r * 0.6, c = size / 2;
  let angle = -90;
  const rad = (d: number) => (d * Math.PI) / 180;
  const paths = data.map((item, i) => {
    if (!item.value) return null;
    const sweep = (item.value / total) * 360;
    const sa = angle; angle += sweep; const ea = angle;
    const x1 = c + r * Math.cos(rad(sa)), y1 = c + r * Math.sin(rad(sa));
    const x2 = c + r * Math.cos(rad(ea)), y2 = c + r * Math.sin(rad(ea));
    const x3 = c + ir * Math.cos(rad(ea)), y3 = c + ir * Math.sin(rad(ea));
    const x4 = c + ir * Math.cos(rad(sa)), y4 = c + ir * Math.sin(rad(sa));
    return <Path key={i} d={`M${x1} ${y1}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}L${x3} ${y3}A${ir} ${ir} 0 ${sweep > 180 ? 1 : 0} 0 ${x4} ${y4}Z`} fill={item.color} />;
  });
  return (
    <Svg width={size} height={size}>
      <G>{paths}</G>
      <SvgText x={c} y={c - 8} textAnchor="middle" fontSize="20" fontWeight="bold" fill="#1f2937">{total}</SvgText>
      <SvgText x={c} y={c + 12} textAnchor="middle" fontSize="10" fill="#6b7280">Orders</SvgText>
    </Svg>
  );
});

// ── LineChart ─────────────────────────────────────────────────────────────────
const LineChart = memo(({ data, width, height, color, label }: {
  data: { month: string; value: number }[]; width: number; height: number; color: string; label: string;
}) => {
  if (!data || data.length < 2) return (
    <View>
      <Text style={styles.chartLabel}>{label}</Text>
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#9ca3af', fontSize: 13 }}>No trend data yet</Text>
      </View>
    </View>
  );
  const pad = { t: 20, r: 20, b: 40, l: 50 };
  const cw = width - pad.l - pad.r, ch = height - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.value)) * 1.1 || 1;
  const xStep = cw / (data.length - 1);
  const pts = data.map((d, i) => ({ x: pad.l + i * xStep, y: pad.t + ch - (d.value / maxV) * ch, month: d.month }));
  const line = pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ');
  const area = `${line} L${pts[pts.length-1].x} ${pad.t+ch} L${pts[0].x} ${pad.t+ch}Z`;
  return (
    <View>
      <Text style={styles.chartLabel}>{label}</Text>
      <Svg width={width} height={height}>
        {[0,0.25,0.5,0.75,1].map((r, i) => (
          <G key={i}>
            <Line x1={pad.l} y1={pad.t+ch*(1-r)} x2={width-pad.r} y2={pad.t+ch*(1-r)} stroke="#e5e7eb" strokeWidth={1} />
            <SvgText x={pad.l-8} y={pad.t+ch*(1-r)+4} textAnchor="end" fontSize="9" fill="#9ca3af">{Math.round(maxV*r)}</SvgText>
          </G>
        ))}
        <Path d={area} fill={color} opacity={0.1} />
        <Path d={line} stroke={color} strokeWidth={2.5} fill="none" />
        {pts.map((p, i) => (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={4} fill="white" stroke={color} strokeWidth={2} />
            <SvgText x={p.x} y={height-10} textAnchor="middle" fontSize="10" fill="#6b7280">{p.month}</SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
});

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Skeleton = memo(() => (
  <View style={{ padding: 16 }}>
    <View style={{ flexDirection: 'row', marginBottom: 16 }}>
      {[0,1,2,3].map(i => <View key={i} style={{ flex: 1, height: 90, backgroundColor: '#e5e7eb', borderRadius: 16, marginRight: i < 3 ? 8 : 0 }} />)}
    </View>
    <View style={{ height: 180, backgroundColor: '#e5e7eb', borderRadius: 16, marginBottom: 12 }} />
    <View style={{ height: 220, backgroundColor: '#e5e7eb', borderRadius: 16, marginBottom: 12 }} />
    <View style={{ height: 200, backgroundColor: '#e5e7eb', borderRadius: 16 }} />
  </View>
));

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#fef3c7', text: '#92400e' },
  approved:  { bg: '#dbeafe', text: '#1e40af' },
  delivered: { bg: '#d1fae5', text: '#065f46' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RetailerDashboard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const cached = screenDataCache[CACHE_KEY];
  const [user, setUser]         = useState<any>(cached?.user ?? null);
  const [rawOrders, setRawOrders] = useState<ApiOrder[]>(cached?.rawOrders ?? []);
  const [summary, setSummary] = useState<RetailerDashboardSummary | null>(cached?.summary ?? null);
  const [loading, setLoading]   = useState(!cached);

  const fetchOrders = useCallback(async (retailerId: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = `/orders/retailer-dashboard?retailerId=${retailerId}`;
      const data = silent ? await cachedGet(endpoint) : await apiGet(endpoint);
      const nextSummary: RetailerDashboardSummary = {
        total: Number(data?.total ?? 0),
        pending: Number(data?.pending ?? 0),
        approved: Number(data?.approved ?? 0),
        delivered: Number(data?.delivered ?? 0),
        orderTrends: Array.isArray(data?.orderTrends) ? data.orderTrends : [],
        recent: Array.isArray(data?.recent)
          ? data.recent.map((order: any) => ({
              id: Number(order.id ?? 0),
              items: Number(order.items ?? order.itemCount ?? 0),
              date: String(order.date ?? order.createdAt ?? ''),
              total: Number(order.total ?? 0),
              status: String(order.status ?? 'pending'),
            }))
          : [],
      };
      setSummary(nextSummary);
      setRawOrders([]);
      screenDataCache[CACHE_KEY] = { ...screenDataCache[CACHE_KEY], summary: nextSummary, rawOrders: [] };
    } catch (e) {
      console.error('Order fetch error:', e);
      try {
        const token = await AsyncStorage.getItem('token');
        const data = await apiGet(`/orders?retailerId=${retailerId}`, token ?? undefined);
        if (Array.isArray(data)) {
          setSummary(null);
          setRawOrders(data);
          screenDataCache[CACHE_KEY] = { ...screenDataCache[CACHE_KEY], summary: null, rawOrders: data };
        }
      } catch (fallbackError) {
        console.error('Order fallback fetch error:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      const userStr = await AsyncStorage.getItem('user');
      if (!userStr) { navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] })); return; }
      const userData = JSON.parse(userStr);
      if (userData.role !== 'retailer') { navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] })); return; }
      setUser(userData);
      screenDataCache[CACHE_KEY] = { ...screenDataCache[CACHE_KEY], user: userData };
      fetchOrders(userData.id, !!cached);
    };
    boot();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single-pass derived data ───────────────────────────────────────────────
  const derived = useMemo(() => {
    if (summary) {
      const calc = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100;
      return {
        total: summary.total,
        pending: summary.pending,
        delivered: summary.delivered,
        approved: summary.approved,
        totalChange: calc(summary.total, 0),
        pendingChange: calc(summary.pending, 0),
        deliveredChange: calc(summary.delivered, 0),
        statusDist: [
          { label: 'Pending', value: summary.pending, color: '#f59e0b' },
          { label: 'Approved', value: summary.approved, color: '#3b82f6' },
          { label: 'Delivered', value: summary.delivered, color: '#10b981' },
        ],
        orderTrends: summary.orderTrends,
        recent: summary.recent,
      };
    }

    const now = new Date();
    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lmEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
    const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let total = 0, pending = 0, delivered = 0, approved = 0;
    let lm_total = 0, lm_pending = 0, lm_delivered = 0;
    const monthCount: Record<string, number> = {};
    for (const o of rawOrders) {
      const dt = new Date(o.createdAt), st = o.status || 'pending';
      total++;
      if (st === 'pending') pending++;
      else if (st === 'delivered') delivered++;
      else if (st === 'approved') approved++;
      const mo = months[dt.getMonth()];
      monthCount[mo] = (monthCount[mo] ?? 0) + 1;
      if (dt >= lmStart && dt <= lmEnd) {
        lm_total++;
        if (st === 'pending') lm_pending++;
        if (st === 'delivered') lm_delivered++;
      }
    }
    const calc = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100;
    const recent = [...rawOrders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4)
      .map(o => ({ id: o.id, items: o.items?.length ?? 0, date: o.createdAt, total: Number(o.total), status: o.status || 'pending' }));
    return {
      total, pending, delivered, approved,
      totalChange: calc(total, lm_total),
      pendingChange: calc(pending, lm_pending),
      deliveredChange: calc(delivered, lm_delivered),
      statusDist: [
        { label: 'Pending', value: pending, color: '#f59e0b' },
        { label: 'Approved', value: approved, color: '#3b82f6' },
        { label: 'Delivered', value: delivered, color: '#10b981' },
      ],
      orderTrends: Object.entries(monthCount).map(([month, value]) => ({ month, value })),
      recent,
    };
  }, [rawOrders, summary]);

  const handleRefresh = useCallback(async () => {
    if (user?.id) await fetchOrders(user.id, false);
  }, [user, fetchOrders]);

  const goTo = useCallback((screen: keyof RootStackParamList) => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: screen }] }));
  }, [navigation]);

  return (
    <AppScreen>
      <Navbar user={user?.name} />
      {loading ? (
        <Skeleton />
      ) : (
        <RefreshWrapper onRefresh={handleRefresh}>
          <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} removeClippedSubviews>

            {/* Stats */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ paddingRight: 16 }}>
              <StatCard title="Total Orders" value={derived.total} icon={<Feather name="shopping-cart" size={18} color={OMS_COLORS.primary} />} bgColor={OMS_COLORS.primarySoft} change={derived.totalChange} />
              <StatCard title="Pending" value={derived.pending} icon={<Feather name="clock" size={18} color="#f59e0b" />} bgColor="#fef3c7" change={derived.pendingChange} />
              <StatCard title="Delivered" value={derived.delivered} icon={<Feather name="check-circle" size={18} color="#10b981" />} bgColor="#d1fae5" change={derived.deliveredChange} />
            </ScrollView>

            {/* Donut */}
            <View style={[styles.card, { marginBottom: 16 }]}>
              <Text style={styles.cardTitle}>Order Status Distribution</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <DonutChart data={derived.statusDist} size={140} />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  {derived.statusDist.map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.color, marginRight: 8 }} />
                      <Text style={{ color: '#6b7280', fontSize: 12, flex: 1 }}>{item.label}</Text>
                      <Text style={{ color: '#1f2937', fontWeight: '600', fontSize: 12 }}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Line chart */}
            <View style={[styles.card, { marginBottom: 16 }]}>
              <LineChart data={derived.orderTrends} width={320} height={200} color={OMS_COLORS.accentDark} label="Monthly Order Trends" />
            </View>

            {/* Recent Orders */}
            <View style={[styles.card, { marginBottom: 16 }]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Recent Orders</Text>
                <Pressable onPress={() => goTo('RetailerOrderScreen')}><Text style={styles.viewAll}>View all</Text></Pressable>
              </View>
              {derived.recent.map((o, i) => (
                <View key={o.id} style={[styles.orderRow, i !== derived.recent.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }]}>
                  <View style={styles.orderIcon}><Feather name="package" size={16} color={OMS_COLORS.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName}>Order #{o.id}</Text>
                    <Text style={styles.orderSub}>{o.items} items · {new Date(o.date).toLocaleDateString('en-IN')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderTotal}>₹{o.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[o.status]?.bg ?? '#f3f4f6' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[o.status]?.text ?? '#374151' }]}>{o.status}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Quick Actions */}
            <View style={[styles.card, { marginBottom: 32 }]}>
              <Text style={styles.cardTitle}>Quick Actions</Text>
              <Pressable style={[styles.btn, { backgroundColor: OMS_COLORS.primary, marginTop: 12, marginBottom: 10 }]} onPress={() => goTo('RetailerHome')}>
                <Ionicons name="grid-outline" size={20} color="#fff" /><Text style={[styles.btnText, { color: '#fff' }]}>Browse Products</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnOutline, { marginBottom: 10 }]} onPress={() => goTo('RetailerOrderScreen')}>
                <Feather name="shopping-cart" size={20} color="#374151" /><Text style={[styles.btnText, { color: '#374151' }]}>View All Orders</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => goTo('Cart')}>
                <Feather name="shopping-bag" size={20} color="#374151" /><Text style={[styles.btnText, { color: '#374151' }]}>Go to Cart</Text>
              </Pressable>
            </View>
          </ScrollView>
        </RefreshWrapper>
      )}
      <BottomTabNavigator />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: OMS_COLORS.surfaceTint, borderRadius: 18, padding: 16, shadowColor: OMS_COLORS.primaryDeep, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: OMS_COLORS.primaryDeep, marginBottom: 8 },
  chartLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  statCard: { backgroundColor: OMS_COLORS.surfaceTint, borderRadius: 18, padding: 16, minWidth: 140, marginRight: 8, shadowColor: OMS_COLORS.primaryDeep, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  statTitle: { color: '#6b7280', fontSize: 12, fontWeight: '500', flex: 1 },
  statIcon: { padding: 8, borderRadius: 12 },
  statValue: { fontSize: 24, fontWeight: '700', color: '#111827' },
  changeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  changeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  changeText: { fontSize: 11, fontWeight: '600' },
  changeLabel: { color: '#9ca3af', fontSize: 10, marginLeft: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  viewAll: { color: OMS_COLORS.accentDark, fontSize: 12, fontWeight: '700' },
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  orderIcon: { backgroundColor: OMS_COLORS.primarySoft, padding: 8, borderRadius: 8, marginRight: 12 },
  orderName: { fontSize: 14, fontWeight: '500', color: '#1f2937' },
  orderSub: { fontSize: 12, color: '#6b7280' },
  orderTotal: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '500' },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnOutline: { backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: OMS_COLORS.primaryBorder },
  btnText: { fontWeight: '600', marginLeft: 8, fontSize: 15 },
});
