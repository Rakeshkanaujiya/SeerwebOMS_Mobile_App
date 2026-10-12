import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Product } from '../components/ProductCart';

export type RootStackParamList = {
  NavbarScreen: undefined;
  Login: undefined;
  AuthLoading: undefined;

  // Dealer
  DealerDashboard: undefined;
  Orders: undefined;        // ✅ ADD
  Retailers: undefined;     // ✅ ADD

  // Retailer
  RetailerDashboard: undefined;
  RetailerHome: undefined;
  Cart: undefined;
  RetailerOrderScreen: undefined;
  ProductDetails: {
    productId: number;
    product?: Product;
    businessTypeId?: number | null;
  };

  // Staff
  StaffDashboard: undefined;
  StaffScreen:
    | {
        refreshCustomersAt?: number;
        refreshProductsAt?: number;
        createdCustomerId?: number | string;
        activeTab?: 'customers' | 'products';
      }
    | undefined;
  StaffOrderScreen: undefined;
  StaffCartScreen: undefined;
  MoreScreen: undefined;
  ShareItems: undefined;
  CreateCustomer:
    | {
        returnTo?: 'StaffScreen';
      }
    | undefined;
  CreateItemMaster:
    | {
        product?: Product;
        returnTo?: 'StaffScreen';
      }
    | undefined;

  // Static
  About: undefined;
  Contact: undefined;
  Profile: undefined;
};

export type DealerDashboardScreenProps =
  NativeStackScreenProps<RootStackParamList, 'DealerDashboard'>;

export type OrdersScreenProps =
  NativeStackScreenProps<RootStackParamList, 'Orders'>;

export type RetailersScreenProps =
  NativeStackScreenProps<RootStackParamList, 'Retailers'>;

export type RetailerDashboardProps =
  NativeStackScreenProps<RootStackParamList, 'RetailerDashboard'>;

export type RetailerHomeProps =
  NativeStackScreenProps<RootStackParamList, 'RetailerHome'>;

export type CartScreenProps =
  NativeStackScreenProps<RootStackParamList, 'Cart'>;

export type RetailerOrderScreenProps =
  NativeStackScreenProps<RootStackParamList, 'RetailerOrderScreen'>;

export type StaffScreenProps =
  NativeStackScreenProps<RootStackParamList, 'StaffScreen'>;

export type StaffDashboardProps =
  NativeStackScreenProps<RootStackParamList, 'StaffDashboard'>;

export type StaffOrderScreenProps =
  NativeStackScreenProps<RootStackParamList, 'StaffOrderScreen'>;

export type StaffCartScreenProps =
  NativeStackScreenProps<RootStackParamList, 'StaffCartScreen'>;

export type MoreScreenProps =
  NativeStackScreenProps<RootStackParamList, 'MoreScreen'>;

export type ShareItemsScreenProps =
  NativeStackScreenProps<RootStackParamList, 'ShareItems'>;

export type ProductDetailsScreenProps =
  NativeStackScreenProps<RootStackParamList, 'ProductDetails'>;

export type CreateCustomerScreenProps =
  NativeStackScreenProps<RootStackParamList, 'CreateCustomer'>;

export type CreateItemMasterScreenProps =
  NativeStackScreenProps<RootStackParamList, 'CreateItemMaster'>;
