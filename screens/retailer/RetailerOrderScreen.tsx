import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import BottomTabNavigator from 'components/BottomTabNavigator';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Navbar from 'components/Navbar';
import OrderDetailsContent, { OrderDetailItem } from 'components/OrderDetailsContent';
import OrderEditorContent, { EditableOrder } from 'components/OrderEditorContent';
import { OMS_COLORS } from '../../src/lib/theme';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import { cachedGet } from '../../src/lib/services/api';
import { logScreenError } from '../../src/lib/logging';
import { shareSalesOrder } from '../../src/lib/orderShare';
import { apiUrl } from 'apiurl';

const TABS = ['all', 'pending', 'approved', 'delivered'];

const STATUS_COLORS: Record<string, { backgroundColor: string; color: string }> = {
  pending: { backgroundColor: '#e2e8f0', color: '#334155' },
  approved: { backgroundColor: '#bfdbfe', color: '#1e40af' },
  delivered: { backgroundColor: '#bbf7d0', color: '#166534' },
  cancelled: { backgroundColor: '#fecaca', color: '#991b1b' },
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
  attributes_snapshot?: Record<string, any> | null;
}
interface Order {
  id: number;
  dealerId: number | string;
  date: string;
  total: number;
  status: string;
  createdAt: string;
  items: OrderItem[];
  ledger:string;
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

const DATE_FILTERS = [
  'All',
  'Today',
  'Yesterday',
  'This Week',
  'Last Week',
  'This Month',
  'Last Month',
  'Custom Period',
];

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 'All'];

const RetailerOrderScreen = () => {
  const navigation = useNavigation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [user, setUser] = useState<{
    id: number;
    name: string;
    role: string;
    business_type_id?: number | string | null;
  } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState('All');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sharingOrderId, setSharingOrderId] = useState<number | string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | string | null>(null);

  // Fetch user
  useEffect(() => {
    let active = true;
    const fetchUser = async () => {
      try {
        const userString = await AsyncStorage.getItem('user');
        if (!active) return;
        if (!userString) {
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
          return;
        }

        const userData = JSON.parse(userString);
        if (userData.role !== 'retailer') {
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
          return;
        }

        setUser(userData);
        setUserId(userData.id);
        setRole(userData.role);
      } catch (error) {
        logScreenError('RetailerOrderScreen.fetchUser', error);
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
      }
    };
    fetchUser();
    return () => {
      active = false;
    };
  }, [navigation]);

  // Fetch orders
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const fetchOrders = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Your session has expired. Please sign in again.');
        const data = await cachedGet(`/orders?retailerId=${userId}`, token);
        if (active) setOrders(Array.isArray(data) ? data : []);
      } catch (err) {
        logScreenError('RetailerOrderScreen.fetchOrders', err, { userId });
        if (active) Alert.alert('Error', 'Failed to fetch orders');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchOrders();
    return () => {
      active = false;
    };
  }, [userId]);

  // Date filter logic
  const applyDateFilter = (orderDate: Date) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    switch (dateFilter) {
      case 'Today':
        return orderDate.toDateString() === now.toDateString();
      case 'Yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return orderDate.toDateString() === yesterday.toDateString();
      case 'This Week':
        return orderDate >= startOfWeek && orderDate <= endOfWeek;
      case 'Last Week':
        const lastWeekStart = new Date(startOfWeek);
        lastWeekStart.setDate(startOfWeek.getDate() - 7);
        const lastWeekEnd = new Date(endOfWeek);
        lastWeekEnd.setDate(endOfWeek.getDate() - 7);
        return orderDate >= lastWeekStart && orderDate <= lastWeekEnd;
      case 'This Month':
        return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      case 'Last Month':
        const lastMonth = new Date(now);
        lastMonth.setMonth(now.getMonth() - 1);
        return orderDate.getMonth() === lastMonth.getMonth() && orderDate.getFullYear() === lastMonth.getFullYear();
      case 'Custom Period':
        if (fromDate && toDate) {
          return orderDate >= fromDate && orderDate <= toDate;
        }
        return true;
      default:
        return true;
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
      .filter((o) => applyDateFilter(new Date(o.createdAt)));
  }, [orders, activeTab, searchText, dateFilter, fromDate, toDate]);

  const isAll = itemsPerPage.toString() === 'All';
  const perPage = isAll ? filteredOrders.length : Number(itemsPerPage);

  const sortedOrders = [...filteredOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const indexOfLastItem = currentPage * perPage;
  const indexOfFirstItem = indexOfLastItem - perPage;

  const paginatedOrders = isAll
    ? sortedOrders
    : sortedOrders.slice(indexOfFirstItem, indexOfLastItem);

  const totalPages = isAll ? 1 : Math.ceil(filteredOrders.length / perPage);

  const handleShareOrder = async (order: Order) => {
    setSharingOrderId(order.id);
    try {
      await shareSalesOrder(order, user?.business_type_id ?? order.business_type_id ?? order.businessTypeId);
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

      setOrders((current) => current.filter((entry) => String(entry.id) !== String(order.id)));
      if (selectedOrder && String(selectedOrder.id) === String(order.id)) {
        setSelectedOrder(null);
        setModalVisible(false);
        setEditingOrder(false);
      }
      Alert.alert('Order deleted', 'The order was deleted successfully.');
    } catch (error) {
      logScreenError('RetailerOrderScreen.deleteOrder', error, { orderId: order.id });
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Navbar user={user?.name} />
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      extraScrollHeight={36}>
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>My Orders</Text>
        <Text style={styles.subheading}>Track your order history and status</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>

        {/* Search Bar */}
        <TextInput
          placeholder="Search by ID or product name"
          value={searchText}
          onChangeText={setSearchText}
          style={styles.searchInput}
        />

        {/* Date Filter Dropdown */}
        <View style={styles.dropdownArea}>
          <Pressable
            onPress={() => setShowDateDropdown(!showDateDropdown)}
            style={styles.filterButton}
          >
            <Text style={styles.filterButtonText}>{dateFilter}</Text>
            <Feather name={showDateDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="white" />
          </Pressable>

          {showDateDropdown && (
            <View style={styles.dateMenu}>
              {DATE_FILTERS.map((filter) => (
                <Pressable
                  key={filter}
                  onPress={() => {
                    setDateFilter(filter);
                    setShowDateDropdown(false);
                  }}
                  style={[styles.menuItem, dateFilter === filter && styles.menuItemActive]}
                >
                  <Text style={styles.menuItemText}>{filter}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Custom Period Date Pickers */}
        {dateFilter === 'Custom Period' && (
          <View style={styles.dateRange}>
            <Pressable
              onPress={() => setShowFromPicker(true)}
              style={styles.dateButton}
            >
              <Text>{fromDate ? fromDate.toDateString() : 'From Date'}</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowToPicker(true)}
              style={styles.dateButton}
            >
              <Text>{toDate ? toDate.toDateString() : 'To Date'}</Text>
            </Pressable>

            {showFromPicker && (
              <DateTimePicker
                value={fromDate || new Date()}
                mode="date"
                display="default"
                onChange={(e, date) => {
                  setShowFromPicker(false);
                  if (date) setFromDate(date);
                }}
              />
            )}
            {showToPicker && (
              <DateTimePicker
                value={toDate || new Date()}
                mode="date"
                display="default"
                onChange={(e, date) => {
                  setShowToPicker(false);
                  if (date) setToDate(date);
                }}
              />
            )}
          </View>
        )}
      </View>      

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Table */}
      <View style={styles.pageSizeArea}>
      <Pressable
        onPress={() => setShowDropdown(!showDropdown)}
        style={styles.pageSizeButton}
      >
        <Text style={styles.filterButtonText}>{itemsPerPage}</Text>
        <Feather name={showDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="white" />
      </Pressable>

      {showDropdown && (
        <View style={styles.pageSizeMenu}>
          <ScrollView>
            {ITEMS_PER_PAGE_OPTIONS.map((num) => (
              <Pressable
                key={num.toString()}
                onPress={() => {
                  setItemsPerPage(num === 'All' ? filteredOrders.length : Number(num));
                  setCurrentPage(1);
                  setShowDropdown(false);
                }}
                style={[styles.menuItem, itemsPerPage === num && styles.menuItemActive]}
              >
                <Text style={styles.menuItemText}>{num}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      </View>
      <View style={styles.tableCard}>
        
        {/* ID Column */}
        <View style={styles.idColumn}>
          <View style={styles.tableHeaderCell}>
            <Text style={styles.tableHeaderText}>ID</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#0000ff" />
          ) : paginatedOrders.length === 0 ? (
            <Text style={styles.emptyText}>No orders</Text>
          ) : (
            paginatedOrders.map((order, index) => (
              <View key={order.id} style={[styles.idRow, index % 2 !== 0 && styles.alternateRow]}>
                <Text style={styles.centerText}>{order.id}</Text>
              </View>
            ))
          )}
        </View>

        {/* Scrollable Columns */}
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
          <View style={styles.tableBody}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderText, styles.customerColumn]}>Customer</Text>
              <Text style={[styles.tableHeaderText, styles.totalColumn]}>Total</Text>
              <Text style={[styles.tableHeaderText, styles.dateColumn]}>Date</Text>
              <Text style={[styles.tableHeaderText, styles.statusColumn]}>Status</Text>
              <Text style={[styles.tableHeaderText, styles.viewColumn]}>View</Text>
              <Text style={[styles.tableHeaderText, styles.shareColumn]}>Share</Text>
              <Text style={[styles.tableHeaderText, styles.deleteColumn]}>Delete</Text>
            </View>

            {paginatedOrders.map((order, index) => {
              const formattedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <View
                  key={order.id}
                  style={[styles.tableRow, index % 2 !== 0 && styles.alternateRow]}
                >
                  <Text style={[styles.cellText, styles.customerColumn]}>{order.ledger}</Text>
                  <Text style={[styles.cellText, styles.totalColumn]}>
                    ₹ {Number(order.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.cellText, styles.dateColumn]}>{formattedDate}</Text>
                  <View style={[styles.statusColumn, styles.statusCell]}>
                    <Text
                      style={[
                        styles.statusBadge,
                        STATUS_COLORS[order.status.toLowerCase()] ?? STATUS_COLORS.pending,
                      ]}
                    >
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setSelectedOrder(order);
                      setEditingOrder(false);
                      setModalVisible(true);
                    }}
                  >
                    <Text style={styles.viewLink}>View</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleShareOrder(order)}
                    disabled={sharingOrderId === order.id}
                    style={styles.shareAction}
                  >
                    <Feather name="share-2" size={14} color="#2563eb" />
                    <Text style={styles.shareLink}>
                      {sharingOrderId === order.id ? 'Sharing' : 'Share'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteOrder(order)}
                    disabled={deletingOrderId === order.id}
                    style={styles.deleteAction}
                  >
                    <Feather name="trash-2" size={14} color="#dc2626" />
                    <Text style={styles.deleteLink}>
                      {deletingOrderId === order.id ? 'Deleting' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>

      </View>
      {/* Pagination Controls */}
      <View style={styles.pagination}>
        <Pressable
          disabled={currentPage === 1}
          onPress={() => setCurrentPage(currentPage - 1)}
          style={[styles.paginationButton, currentPage === 1 && styles.disabledButton]}
        >
          <Text style={styles.paginationButtonText}>Prev</Text>
        </Pressable>
        <Text style={styles.pageNumber}>{currentPage}/{totalPages || 1}</Text>
        <Pressable
          disabled={currentPage === totalPages}
          onPress={() => setCurrentPage(currentPage + 1)}
          style={[styles.paginationButton, currentPage === totalPages && styles.disabledButton]}
        >
          <Text style={styles.paginationButtonText}>Next</Text>
        </Pressable>
      </View>

      {selectedOrder && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setEditingOrder(false);
            setModalVisible(false);
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Pressable
                style={styles.modalClose}
                onPress={() => {
                  setEditingOrder(false);
                  setModalVisible(false);
                }}
              >
                <Feather name="x" size={20} color="red" />
              </Pressable>

              <View style={styles.modalTitleRow}>
                <View style={styles.modalTitleSpacer} />
                <Text style={styles.modalTitle}>Order Details</Text>
                <Pressable
                  onPress={() => handleShareOrder(selectedOrder)}
                  disabled={sharingOrderId === selectedOrder.id}
                  style={styles.modalShareButton}
                >
                  <Feather name="share-2" size={18} color={OMS_COLORS.primary} />
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>
                Order #{String(selectedOrder.id)} - {new Date(selectedOrder.createdAt).toLocaleString()}
              </Text>

              {editingOrder ? (
                <OrderEditorContent
                  order={selectedOrder as EditableOrder}
                  onCancel={() => setEditingOrder(false)}
                  onSaved={(updatedOrder) => {
                    const nextOrder = updatedOrder as Order;
                    setOrders((current) =>
                      current.map((entry) => (entry.id === nextOrder.id ? nextOrder : entry))
                    );
                    setSelectedOrder(nextOrder);
                    setEditingOrder(false);
                  }}
                />
              ) : (
                <>
                  <ScrollView style={{ maxHeight: 430 }} showsVerticalScrollIndicator={false}>
                    <OrderDetailsContent
                      items={selectedOrder.items as OrderDetailItem[]}
                      total={Number(selectedOrder.total || 0)}
                      notes={selectedOrder.notes}
                    />
                  </ScrollView>
                  {selectedOrder.status.toLowerCase() === 'pending' ? (
                    <Pressable style={styles.editOrderButton} onPress={() => setEditingOrder(true)}>
                      <Feather name="edit-2" size={17} color="#ffffff" />
                      <Text style={styles.editOrderButtonText}>Edit Order</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </Modal>
      )}

    </KeyboardAwareScrollView>
    <BottomTabNavigator />
    </SafeAreaView>
    
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screenContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  headingBlock: {
    marginBottom: 16,
  },
  heading: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subheading: {
    marginTop: 2,
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
  },
  controls: {
    zIndex: 30,
    marginBottom: 16,
    gap: 12,
  },
  searchInput: {
    height: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    color: '#111827',
    fontSize: 14,
  },
  dropdownArea: {
    position: 'relative',
  },
  filterButton: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: OMS_COLORS.primary,
  },
  filterButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  dateMenu: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    zIndex: 50,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
  },
  menuItemActive: {
    backgroundColor: '#dbeafe',
  },
  menuItemText: {
    color: '#1f2937',
  },
  dateRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateButton: {
    width: '48%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  tabs: {
    marginBottom: 16,
  },
  tab: {
    marginRight: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  activeTab: {
    backgroundColor: OMS_COLORS.primary,
  },
  tabText: {
    color: '#1f2937',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#ffffff',
  },
  pageSizeArea: {
    position: 'relative',
    zIndex: 20,
    width: 88,
    marginBottom: 8,
  },
  pageSizeButton: {
    width: 80,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: OMS_COLORS.primary,
  },
  pageSizeMenu: {
    position: 'absolute',
    top: 46,
    left: 0,
    width: 96,
    zIndex: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#60a5fa',
    borderRadius: 8,
    backgroundColor: OMS_COLORS.surfaceTint,
    elevation: 8,
  },
  tableCard: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    elevation: 3,
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOpacity: 0.09,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  idColumn: {
    width: 50,
    backgroundColor: OMS_COLORS.surfaceTint,
  },
  tableHeaderCell: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  tableHeaderText: {
    color: '#4b5563',
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    paddingVertical: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  idRow: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  alternateRow: {
    backgroundColor: '#f3f4f6',
  },
  centerText: {
    color: '#1f2937',
    textAlign: 'center',
  },
  tableScroll: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  tableBody: {
    minWidth: 596,
  },
  tableHeaderRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  tableRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  cellText: {
    color: '#1f2937',
    textAlign: 'center',
  },
  customerColumn: { width: 100 },
  totalColumn: { width: 80 },
  dateColumn: { width: 100 },
  statusColumn: { width: 110 },
  viewColumn: { width: 100 },
  shareColumn: { width: 96 },
  deleteColumn: { width: 96 },
  statusCell: {
    alignItems: 'center',
  },
  statusBadge: {
    width: 80,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    textAlign: 'center',
  },
  viewLink: {
    width: 100,
    color: OMS_COLORS.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  shareAction: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  shareLink: {
    color: OMS_COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteAction: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteLink: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
    gap: 8,
  },
  paginationButton: {
    minWidth: 56,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: OMS_COLORS.primary,
  },
  disabledButton: {
    opacity: 0.45,
  },
  paginationButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  pageNumber: {
    marginHorizontal: 8,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    position: 'relative',
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    padding: 4,
  },
  modalTitleRow: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleSpacer: {
    width: 36,
  },
  modalTitle: {
    flex: 1,
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalShareButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  modalSubtitle: {
    marginBottom: 12,
    color: '#6b7280',
    fontSize: 12,
  },
  editOrderButton: {
    height: 44,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: OMS_COLORS.primary,
  },
  editOrderButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default RetailerOrderScreen;
