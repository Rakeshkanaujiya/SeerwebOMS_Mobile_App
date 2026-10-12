import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import BottomTabNavigator from 'components/BottomTabNavigator';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Navbar from 'components/Navbar';
import OrderDetailsContent, { OrderDetailItem } from 'components/OrderDetailsContent';
import { OMS_COLORS } from '../../src/lib/theme';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import SearchSelect, { SearchSelectOption, toSearchSelectOptions } from 'components/SearchSelect';
import { cachedGet } from '../../src/lib/services/api';
import { logScreenError } from '../../src/lib/logging';
import { getCustomerDealerId } from '../../src/lib/customers';
import { invalidateCaches } from '../../src/lib/cache';
import { useCart, type CartItem } from '../../context/CartContext';
import { shareSalesOrder } from '../../src/lib/orderShare';
import { apiUrl } from 'apiurl';

const TABS = ['all', 'pending', 'approved', 'delivered'];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#E2E8F0', text: '#475569' },
  approved:  { bg: '#bfdbfe', text: '#1e40af' },
  delivered: { bg: '#bbf7d0', text: '#166534' },
  cancelled: { bg: '#fecaca', text: '#991b1b' },
};

interface OrderItem {
  product: {
    name: string;
    price: number;
    mrp?: number | null;
    rate?: number | null;
  };
  quantity: number;
  price?: number;
  productId?: number;
  variantId?: number | null;
  size?: string | null;
  color?: string | null;
  rack?: string | null;
  taxableValue?: number | null;
  gstPercentage?: number | null;
  gstAmount?: number | null;
  gstSlabId?: number | string | null;
  attributes_snapshot?: Record<string, any> | null;
}

interface Order {
  id: string;
  dealerId: number | string;
  retailerId: string;
  retailerName: string;
  retailerStoreName: string;
  ledger: string;
  total: number;
  status: string;
  createdAt: string;
  items: OrderItem[];
  order_by_id?: string;
  businessTypeId?: number | string | null;
  business_type_id?: number | string | null;
  retailerPhone?: string | null;
  retailerAddress?: string | null;
  retailer_phone?: string | null;
  retailer_address?: string | null;
  dealerCompanyName?: string | null;
  dealer_company?: string | null;
  dealerPhone?: string | null;
  dealerAddress?: string | null;
  dealer_phone?: string | null;
  dealer_address?: string | null;
  notes?: string;
}

interface Retailer {
  id: number;
  ledger: string;
  name?: string;
  phone?: string;
  mobile?: string;
  username?: string;
  registration_date: string;
  assigned: string;
}

const DATE_FILTERS = [
  'All', 'Today', 'Yesterday', 'This Week', 'Last Week',
  'This Month', 'Last Month', 'Custom Period',
];

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 'All'];

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function orderItemsToCartItems(order: Order): CartItem[] {
  return (Array.isArray(order.items) ? order.items : []).map((item) => {
    const snapshot = item.attributes_snapshot ?? {};
    const garmentMeta = snapshot.garment_meta ?? {};
    const lineMrp = asNumber(item.product?.mrp ?? snapshot.mrp ?? item.product?.price ?? item.price, 0);
    const orderMode = snapshot.order_mode ?? garmentMeta.orderMode;
    const sizeSetSizes = Array.isArray(snapshot.size_set_sizes)
      ? snapshot.size_set_sizes.map(String)
      : Array.isArray(garmentMeta.sizeSetSizes)
        ? garmentMeta.sizeSetSizes.map(String)
        : undefined;

    return {
      productId: Number(item.productId ?? 0),
      variantId: item.variantId ?? 0,
      size: item.size ?? snapshot.size ?? '',
      color: item.color ?? garmentMeta.selectedColor ?? snapshot.color ?? '',
      price: asNumber(item.price ?? item.product?.rate ?? item.product?.price, 0),
      quantity: asNumber(item.quantity, 0),
      stock: asNumber(garmentMeta.selectedStock ?? snapshot.stock, 0),
      mrp: lineMrp,
      rack: item.rack ?? snapshot.rack ?? snapshot.rack_number ?? '',
      productName: item.product?.name || `Product #${item.productId ?? ''}`,
      image: garmentMeta.selectedImage ?? null,
      brand: String(snapshot.brand ?? snapshot.Brand ?? ''),
      model: String(snapshot.model ?? snapshot.Model ?? ''),
      businessTypeId: snapshot.business_type_id ?? null,
      attributes: snapshot,
      setQuantity: asNumber(snapshot.set_quantity, orderMode === 'size_set' ? asNumber(item.quantity, 0) : 0),
      orderMode,
      sizeSetId: snapshot.size_set_id ?? garmentMeta.sizeSetId,
      sizeSetName: snapshot.size_set_name ?? garmentMeta.sizeSetName,
      sizeSetSizes,
      garmentMeta:
        Object.keys(garmentMeta).length > 0
          ? {
              ...garmentMeta,
              designNumber: garmentMeta.designNumber ?? garmentMeta.design_number ?? snapshot.design_number,
              selectedColor: item.color ?? garmentMeta.selectedColor,
              selectedPrice: asNumber(item.price ?? garmentMeta.selectedPrice, 0),
              selectedMrp: lineMrp,
              sizeSetSizes,
            }
          : undefined,
    };
  }).filter((item) => item.productId > 0 && item.quantity > 0);
}

const StaffOrderScreen = () => {
  const navigation = useNavigation();
  const { startOrderEdit } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [filteredRetailers, setFilteredRetailers] = useState<Retailer[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState('All');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [reportRetailerId, setReportRetailerId] = useState('all');
  const [reportStaffId, setReportStaffId] = useState('all');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showLimitDropdown, setShowLimitDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | string>(10);
  const [user, setUser] = useState<any>(null);
  const [sharingOrderId, setSharingOrderId] = useState<string | number | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | number | null>(null);

  useEffect(() => {
    let active = true;
    const fetchUser = async () => {
      try {
        const userString = await AsyncStorage.getItem('user');
        if (!active) return;
        if (!userString) { navigation.navigate('Login' as never); return; }
        const parsedUser = JSON.parse(userString);
        if (parsedUser.role !== 'staff' && parsedUser.role !== 'dealer') { navigation.navigate('Login' as never); return; }
        setUserId(parsedUser.id);
        setReportStaffId(parsedUser.id);
        setUser(parsedUser);
      } catch (error) {
        logScreenError('StaffOrderScreen.fetchUser', error);
        navigation.navigate('Login' as never);
      }
    };
    fetchUser();
    return () => {
      active = false;
    };
  }, [navigation]);

  useEffect(() => {
    if (!userId || !user) return;
    let active = true;
    const fetchOrders = async () => {
      try {
        const dealerId = getCustomerDealerId(user);
        if (!dealerId) return;
        const endpoint =
          user.role === 'dealer'
            ? `/orders/fordealer?dealerId=${dealerId}`
            : `/orders/byexecutive?executiveid=${userId}`;
        // Use the persisted authenticated session. Passing the token here also
        // makes this protected call safe during cold start and cache refresh.
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Your session has expired. Please sign in again.');
        const data = await cachedGet(endpoint, token);
        if (active) setOrders(Array.isArray(data) ? data : []);
      } catch (err) {
        logScreenError('StaffOrderScreen.fetchOrders', err, { userId, role: user.role });
        if (active) Alert.alert('Error', 'Failed to fetch orders');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchOrders();
    return () => {
      active = false;
    };
  }, [user, userId]);

  useEffect(() => {
    const dealerId = getCustomerDealerId(user);
    if (!dealerId) return;
    let active = true;
    const fetchRetailers = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;
        const data = await cachedGet(`/retailers?dealerid=${dealerId}`, token);
        if (active) setRetailers(Array.isArray(data) ? data : []);
      } catch (err) {
        logScreenError('StaffOrderScreen.fetchRetailers', err, { dealerId });
      }
    };
    fetchRetailers();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!Array.isArray(retailers)) { setFilteredRetailers([]); return; }
    let filtered = [...retailers];
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay() + 1);
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfWeek); endOfLastWeek.setDate(startOfWeek.getDate() - 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    filtered = filtered.filter((r) => {
      if (!r.registration_date) return false;
      const regDate = new Date(r.registration_date);
      switch (dateFilter) {
        case 'Today':       return regDate.toDateString() === today.toDateString();
        case 'Yesterday':   return regDate.toDateString() === yesterday.toDateString();
        case 'This Week':   return regDate >= startOfWeek && regDate <= endOfWeek;
        case 'Last Week':   return regDate >= startOfLastWeek && regDate <= endOfLastWeek;
        case 'This Month':  return regDate >= startOfMonth && regDate <= endOfMonth;
        case 'Last Month':  return regDate >= startOfLastMonth && regDate <= endOfLastMonth;
        case 'Custom Period':
          if (!fromDate || !toDate) return true;
          const to = new Date(toDate); to.setHours(23, 59, 59, 999);
          return regDate >= fromDate && regDate <= to;
        default: return true;
      }
    });
    setFilteredRetailers(filtered);
  }, [dateFilter, fromDate, toDate, retailers]);

  const applyDateFilter = (orderDate: Date) => {
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
    switch (dateFilter) {
      case 'Today':   return orderDate.toDateString() === now.toDateString();
      case 'Yesterday':
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        return orderDate.toDateString() === yesterday.toDateString();
      case 'This Week': return orderDate >= startOfWeek && orderDate <= endOfWeek;
      case 'Last Week':
        const lwS = new Date(startOfWeek); lwS.setDate(startOfWeek.getDate() - 7);
        const lwE = new Date(endOfWeek); lwE.setDate(endOfWeek.getDate() - 7);
        return orderDate >= lwS && orderDate <= lwE;
      case 'This Month':
        return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      case 'Last Month':
        const lm = new Date(now); lm.setMonth(now.getMonth() - 1);
        return orderDate.getMonth() === lm.getMonth() && orderDate.getFullYear() === lm.getFullYear();
      case 'Custom Period':
        if (fromDate && toDate) return orderDate >= fromDate && orderDate <= toDate;
        return true;
      default: return true;
    }
  };

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => (activeTab === 'all' ? true : o.status === activeTab))
      .filter((o) =>
        o.id.toString().includes(searchText) ||
        o.total.toString().includes(searchText) ||
        (Array.isArray(o.items) ? o.items : []).some((item) =>
          String(item?.product?.name ?? '').toLowerCase().includes(searchText.toLowerCase())
        )
      )
      .filter((o) => applyDateFilter(new Date(o.createdAt)))
      .filter((o) => reportRetailerId === 'all' ? true : String(o.retailerId) === reportRetailerId);
  }, [orders, activeTab, searchText, dateFilter, fromDate, toDate, reportRetailerId]);

  const isAll = itemsPerPage === 'All';
  const perPage = isAll ? filteredOrders.length : Number(itemsPerPage);
  const sortedOrders = [...filteredOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const indexOfLastItem = currentPage * perPage;
  const indexOfFirstItem = indexOfLastItem - perPage;
  const paginatedOrders = isAll ? sortedOrders : sortedOrders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = isAll ? 1 : Math.ceil(filteredOrders.length / perPage);
  const dateFilterOptions = useMemo(
    () => toSearchSelectOptions(DATE_FILTERS),
    []
  );
  const customerOptions = useMemo<SearchSelectOption[]>(
    () =>
      filteredRetailers.map((retailer) => ({
        value: String(retailer.id),
        label: retailer.ledger || retailer.name || `Customer #${retailer.id}`,
        description: [retailer.name, retailer.phone || retailer.mobile, retailer.username]
          .filter(Boolean)
          .join(' · '),
        searchText: [
          retailer.ledger,
          retailer.name,
          retailer.phone,
          retailer.mobile,
          retailer.username,
          retailer.assigned,
        ]
          .filter(Boolean)
          .join(' '),
      })),
    [filteredRetailers]
  );
  const limitOptions = useMemo(
    () => toSearchSelectOptions(ITEMS_PER_PAGE_OPTIONS.map(String)),
    []
  );

  const handleEditOrder = async (order: Order) => {
    if (order.status.toLowerCase() !== 'pending') return;

    const retailer = retailers.find((entry) => String(entry.id) === String(order.retailerId));
    const selectedRetailer = {
      ...(retailer ?? {}),
      id: Number(order.retailerId),
      name: retailer?.name || order.retailerName,
      ledger:
        retailer?.ledger ||
        order.ledger ||
        order.retailerStoreName ||
        order.retailerName,
    };

    try {
      await AsyncStorage.setItem('selectedRetailer', JSON.stringify(selectedRetailer));
      startOrderEdit(
        {
          orderId: String(order.id),
          retailerId: order.retailerId,
          retailerName: selectedRetailer.ledger || selectedRetailer.name,
          notes: order.notes || '',
        },
        orderItemsToCartItems(order)
      );
      setModalVisible(false);
      setSelectedOrder(null);
      (navigation as any).navigate('StaffScreen', { activeTab: 'products' });
    } catch (error) {
      logScreenError('StaffOrderScreen.handleEditOrder', error, { orderId: order.id });
      Alert.alert('Edit Order', 'Could not load this order into the cart.');
    }
  };

  const handleShareOrder = async (order: Order) => {
    setSharingOrderId(order.id);
    try {
      const isDairy = Number(user?.business_type_id ?? order.business_type_id ?? order.businessTypeId) === 3;
      const retailer = retailers.find((entry) => String(entry.id) === String(order.retailerId));
      const printableOrder = isDairy
        ? {
            ...order,
            retailerPhone: order.retailerPhone ?? order.retailer_phone ?? retailer?.phone ?? retailer?.mobile,
            retailerAddress: order.retailerAddress ?? order.retailer_address ?? (retailer as any)?.address,
            // The supplier is the dealer/company. Never substitute the signed-in person's name.
            dealerCompanyName:
              order.dealerCompanyName ??
              order.dealer_company ??
              user?.dealer_company_name ??
              user?.company_name ??
              null,
            dealerPhone: order.dealerPhone ?? order.dealer_phone ?? (user?.role === 'dealer' ? user?.phone : null),
            dealerAddress: order.dealerAddress ?? order.dealer_address ?? (user?.role === 'dealer' ? user?.address : null),
          }
        : order;
      await shareSalesOrder(printableOrder, user?.business_type_id ?? order.business_type_id ?? order.businessTypeId);
    } finally {
      setSharingOrderId(null);
    }
  };

  const deleteOrder = async (order: Order) => {
    setDeletingOrderId(order.id);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${apiUrl}/orders/${order.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.messages?.error || payload?.message || 'Failed to delete order');
      }

      invalidateCaches('/orders');
      setOrders((current) => current.filter((entry) => String(entry.id) !== String(order.id)));
      if (selectedOrder && String(selectedOrder.id) === String(order.id)) {
        setSelectedOrder(null);
        setModalVisible(false);
      }
      Alert.alert('Order deleted', 'The order was deleted successfully.');
    } catch (error) {
      logScreenError('StaffOrderScreen.deleteOrder', error, { orderId: order.id });
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete order.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleDeleteOrder = (order: Order) => {
    Alert.alert(
      'Delete order?',
      `Delete order #${order.id}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteOrder(order) },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
      <Navbar user={user?.name} />
      <KeyboardAwareScrollView
        style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 100 }}
        extraScrollHeight={36}
      >
        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFFFFF' }}>My Orders</Text>
          <Text style={{ color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>Track your order history and status</Text>
        </View>

        {/* Search */}
        <TextInput
          placeholder="Search by ID or product name"
          value={searchText}
          onChangeText={setSearchText}
          style={{
            backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 16, paddingVertical: 10,
            borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)',
            marginBottom: 12, fontSize: 14,
          }}
          placeholderTextColor="#9ca3af"
        />

        <View style={{ marginBottom: 12 }}>
          <SearchSelect
            value={dateFilter}
            options={dateFilterOptions}
            placeholder="Select Date Filter"
            searchPlaceholder="Search date filter..."
            onChange={(nextValue) => setDateFilter(nextValue || 'All')}
            allowClear={false}
          />
        </View>

        {/* Custom Period Pickers */}
        {dateFilter === 'Custom Period' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Pressable
              onPress={() => setShowFromPicker(true)}
              style={{
                backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
                borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', width: '48%',
              }}
            >
              <Text style={{ color: '#374151' }}>{fromDate ? fromDate.toDateString() : 'From Date'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowToPicker(true)}
              style={{
                backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
                borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', width: '48%',
              }}
            >
              <Text style={{ color: '#374151' }}>{toDate ? toDate.toDateString() : 'To Date'}</Text>
            </Pressable>
            {showFromPicker && (
              <DateTimePicker value={fromDate || new Date()} mode="date" display="default"
                onChange={(e, date) => { setShowFromPicker(false); if (date) setFromDate(date); }} />
            )}
            {showToPicker && (
              <DateTimePicker value={toDate || new Date()} mode="date" display="default"
                onChange={(e, date) => { setShowToPicker(false); if (date) setToDate(date); }} />
            )}
          </View>
        )}

        <View style={{ marginBottom: 12 }}>
          <SearchSelect
            value={reportRetailerId === 'all' ? '' : reportRetailerId}
            options={customerOptions}
            placeholder="All Customers"
            clearLabel="All Customers"
            searchPlaceholder="Search customer, mobile, username..."
            emptyText="No customers found"
            onChange={(nextValue) => setReportRetailerId(nextValue || 'all')}
          />
        </View>

        {/* Status Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                marginRight: 12, paddingHorizontal: 16, paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: activeTab === tab ? OMS_COLORS.primary : 'rgba(255,255,255,0.86)',
              }}
            >
            <Text style={{ fontSize: 14, fontWeight: '700', color: activeTab === tab ? '#fff' : OMS_COLORS.primaryDeep }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ marginBottom: 8, maxWidth: 180 }}>
          <SearchSelect
            value={String(itemsPerPage)}
            options={limitOptions}
            placeholder="Rows"
            searchPlaceholder="Search rows..."
            onChange={(nextValue) => {
              const value = nextValue || '10';
              setItemsPerPage(value === 'All' ? filteredOrders.length : Number(value));
              setCurrentPage(1);
            }}
            allowClear={false}
          />
        </View>

        {/* Table */}
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {/* ID Column */}
          <View style={{
            width: 52, backgroundColor: '#fff',
            borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
          }}>
            <View style={{ height: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f3f4f6', borderTopLeftRadius: 12 }}>
              <Text style={{ fontWeight: '600', color: '#4b5563', textAlign: 'center', fontSize: 13 }}>ID</Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 12 }} />
            ) : paginatedOrders.length === 0 ? (
              <Text style={{ color: '#6b7280', textAlign: 'center', paddingVertical: 16, fontSize: 12 }}>—</Text>
            ) : (
              paginatedOrders.map((order, index) => (
                <View
                  key={order.id}
                  style={{ height: 52, justifyContent: 'center', backgroundColor: index % 2 === 0 ? '#fff' : '#f9fafb' }}
                >
                  <Text style={{ textAlign: 'center', color: '#1f2937', fontSize: 13 }}>{order.id}</Text>
                </View>
              ))
            )}
          </View>

          {/* Scrollable Columns */}
          <ScrollView horizontal showsHorizontalScrollIndicator style={{
            backgroundColor: '#fff', borderTopRightRadius: 12, borderBottomRightRadius: 12,
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
          }}>
            <View style={{ minWidth: 600 }}>
              {/* Header row */}
              <View style={{ flexDirection: 'row', height: 52, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f3f4f6', alignItems: 'center', borderTopRightRadius: 12 }}>
                <Text style={{ width: 110, fontWeight: '600', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Customer</Text>
                <Text style={{ width: 90, fontWeight: '600', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Total</Text>
                <Text style={{ width: 100, fontWeight: '600', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Date</Text>
                <Text style={{ width: 100, fontWeight: '600', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Status</Text>
                <Text style={{ width: 80, fontWeight: '600', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>View</Text>
                <Text style={{ width: 90, fontWeight: '600', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Share</Text>
                <Text style={{ width: 90, fontWeight: '600', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Delete</Text>
              </View>

              {paginatedOrders.length === 0 && !loading ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: '#6b7280', textAlign: 'center' }}>No orders found</Text>
                </View>
              ) : (
                paginatedOrders.map((order, index) => {
                  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  });
                  const statusStyle = STATUS_STYLES[order.status.toLowerCase()] ?? { bg: '#f3f4f6', text: '#374151' };
                  return (
                    <View
                      key={order.id}
                      style={{ flexDirection: 'row', height: 52, alignItems: 'center', backgroundColor: index % 2 === 0 ? '#fff' : '#f9fafb' }}
                    >
                      <Text style={{ width: 110, textAlign: 'center', color: '#1f2937', fontSize: 13, paddingHorizontal: 4 }} numberOfLines={2}>
                        {order.ledger}
                      </Text>
                      <Text style={{ width: 90, textAlign: 'center', color: '#1f2937', fontSize: 13 }}>
                        ₹{Number(order.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={{ width: 100, textAlign: 'center', color: '#1f2937', fontSize: 12 }}>{formattedDate}</Text>
                      <View style={{ width: 100, alignItems: 'center' }}>
                        <Text style={{
                          fontSize: 11, paddingHorizontal: 8, paddingVertical: 3,
                          borderRadius: 999, textAlign: 'center',
                          backgroundColor: statusStyle.bg, color: statusStyle.text,
                          fontWeight: '600', overflow: 'hidden',
                        }}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setSelectedOrder(order);
                          setModalVisible(true);
                        }}
                        style={{ width: 80, alignItems: 'center' }}
                      >
                        <Text style={{ color: '#2563eb', textDecorationLine: 'underline', fontSize: 13 }}>View</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleShareOrder(order)}
                        disabled={sharingOrderId === order.id}
                        style={{ width: 90, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
                      >
                        <Feather name="share-2" size={14} color="#2563eb" />
                        <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '700' }}>
                          {sharingOrderId === order.id ? 'Sharing' : 'Share'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteOrder(order)}
                        disabled={deletingOrderId === order.id}
                        style={{ width: 90, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
                      >
                        <Feather name="trash-2" size={14} color="#dc2626" />
                        <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>
                          {deletingOrderId === order.id ? 'Deleting' : 'Delete'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>

        {/* Pagination */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 8 }}>
          <Pressable
            disabled={currentPage === 1}
            onPress={() => setCurrentPage(currentPage - 1)}
            style={{
              paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8,
              backgroundColor: currentPage === 1 ? '#93c5fd' : '#60a5fa',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '500' }}>Prev</Text>
          </Pressable>
          <Text style={{ marginHorizontal: 4, color: '#FFFFFF', fontWeight: '700' }}>
            {currentPage}/{totalPages || 1}
          </Text>
          <Pressable
            disabled={currentPage === totalPages}
            onPress={() => setCurrentPage(currentPage + 1)}
            style={{
              paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8,
              backgroundColor: currentPage === totalPages ? '#93c5fd' : '#60a5fa',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '500' }}>Next</Text>
          </Pressable>
        </View>

        {/* Order Detail Modal */}
        {selectedOrder && (
          <Modal
            visible={modalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => {
              setModalVisible(false);
            }}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <View style={{
                backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16,
                borderRadius: 12, width: '100%',
                shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
              }}>
                <Pressable
                  style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}
                  onPress={() => {
                    setModalVisible(false);
                  }}>
                  <Feather name="x" size={20} color="#ef4444" />
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ width: 36 }} />
                  <Text style={{ flex: 1, textAlign: 'center', fontWeight: 'bold', fontSize: 18 }}>
                    Order Details
                  </Text>
                  <Pressable
                    onPress={() => handleShareOrder(selectedOrder!)}
                    disabled={sharingOrderId === selectedOrder!.id}
                    style={{
                      width: 36,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 18,
                      backgroundColor: '#F3EEFF',
                    }}>
                    <Feather name="share-2" size={18} color={OMS_COLORS.primary} />
                  </Pressable>
                </View>
                <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                  Order #{selectedOrder!.id} · {new Date(selectedOrder!.createdAt).toLocaleString()}
                </Text>
                <ScrollView style={{ maxHeight: 430 }} showsVerticalScrollIndicator={false}>
                  <OrderDetailsContent
                    items={selectedOrder!.items as OrderDetailItem[]}
                    total={Number(selectedOrder!.total || 0)}
                    notes={selectedOrder!.notes}
                  />
                </ScrollView>
                {selectedOrder!.status.toLowerCase() === 'pending' ? (
                  <Pressable
                    onPress={() => handleEditOrder(selectedOrder!)}
                    style={{
                      height: 44,
                      marginTop: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      borderRadius: 8,
                      backgroundColor: OMS_COLORS.primary,
                    }}>
                    <Feather name="edit-2" size={17} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>
                      Edit Order
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Modal>
        )}
      </KeyboardAwareScrollView>
      <BottomTabNavigator />
    </SafeAreaView>
  );
};

export default StaffOrderScreen;
