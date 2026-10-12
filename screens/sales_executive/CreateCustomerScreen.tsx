import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from 'components/CustomAlert';
import KeyboardAwareScrollView from 'components/KeyboardAwareScrollView';
import Navbar from 'components/Navbar';
import ScreenSkeleton from 'components/ScreenSkeleton';
import type { CreateCustomerScreenProps } from '../../types/navigation';
import {
  hydrateStaffCreateCustomerPermission,
  refreshAuthenticatedUser,
} from '../../src/lib/auth';
import {
  canCreateCustomersForUser,
  checkCustomerUsernameAndPhone,
  checkRetailerDuplicates,
  createRetailerCustomer,
  DEFAULT_CUSTOMER_CREATION_SETTINGS,
  EMPTY_CUSTOMER_FORM,
  generateCustomerUsername,
  getCustomerDealerId,
  loadCustomerCreationSettings,
  normalizePhone,
  normalizeText,
  type CustomerCreationSettings,
  type CustomerFormData,
  type CustomerStandardFieldKey,
} from '../../src/lib/customers';
import { OMS_COLORS } from '../../src/lib/theme';

type CustomerFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  required?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
  error?: string;
  disableAutofill?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

function CustomerField({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  required,
  keyboardType = 'default',
  secureTextEntry = false,
  error,
  disableAutofill = false,
  autoCapitalize,
}: CustomerFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        <Ionicons name={icon} size={13} color="#94A3B8" /> {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'words')}
        autoCorrect={false}
        autoComplete={disableAutofill ? 'off' : keyboardType === 'email-address' ? 'email' : undefined}
        importantForAutofill={disableAutofill ? 'no' : 'auto'}
        textContentType={disableAutofill ? 'none' : keyboardType === 'email-address' ? 'emailAddress' : 'none'}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const STANDARD_CUSTOMER_FIELDS: CustomerStandardFieldKey[] = [
  'username',
  'name',
  'ledger',
  'email',
  'phone',
  'address',
  'password',
  'confirmPassword',
];

const STANDARD_FIELD_META: Record<CustomerStandardFieldKey, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
}> = {
  username: { label: 'Username', icon: 'person-outline', placeholder: 'Leave empty to auto-generate' },
  name: { label: 'Full Name', icon: 'person-outline', placeholder: 'e.g. Ramesh Kumar' },
  ledger: { label: 'Ledger', icon: 'business-outline', placeholder: 'e.g. Ramesh Electronics' },
  email: { label: 'Email', icon: 'mail-outline', placeholder: 'e.g. ramesh@store.com', keyboardType: 'email-address' },
  phone: { label: 'Phone', icon: 'call-outline', placeholder: 'e.g. 9876543210', keyboardType: 'phone-pad' },
  address: { label: 'Address', icon: 'location-outline', placeholder: 'e.g. Shop 5, Main Rd' },
  password: { label: 'Password', icon: 'lock-closed-outline', placeholder: 'Enter password', secureTextEntry: true },
  confirmPassword: { label: 'Confirm Password', icon: 'key-outline', placeholder: 'Re-enter password', secureTextEntry: true },
};

export default function CreateCustomerScreen({ navigation }: CreateCustomerScreenProps) {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState('');
  const [form, setForm] = useState<CustomerFormData>(EMPTY_CUSTOMER_FORM);
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [checkingUnique, setCheckingUnique] = useState(false);
  const [saving, setSaving] = useState(false);
  const [booting, setBooting] = useState(true);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [creationSettings, setCreationSettings] = useState<CustomerCreationSettings>(
    DEFAULT_CUSTOMER_CREATION_SETTINGS
  );

  const dealerId = useMemo(() => getCustomerDealerId(user), [user]);
  const canCreateCustomers = useMemo(() => canCreateCustomersForUser(user), [user]);

  const showAlert = useCallback((message: string) => {
    setAlertMsg(message);
    setAlertVisible(true);
  }, []);

  const updateField = useCallback((field: keyof CustomerFormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  const updateCustomField = useCallback((fieldKey: string, value: string) => {
    setForm((current) => ({
      ...current,
      custom_fields: {
        ...current.custom_fields,
        [fieldKey]: value,
      },
    }));
  }, []);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        const [storedUser, storedToken] = await Promise.all([
          AsyncStorage.getItem('user'),
          AsyncStorage.getItem('token'),
        ]);

        if (!storedUser || !storedToken) {
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }

        const parsedUser = JSON.parse(storedUser);
        let activeUser = parsedUser;

        if (!canCreateCustomersForUser(activeUser) && activeUser.role === 'staff') {
          activeUser = await hydrateStaffCreateCustomerPermission(parsedUser, storedToken);
          await AsyncStorage.setItem('user', JSON.stringify(activeUser));
        }

        if (!active) return;
        setUser(activeUser);
        setToken(storedToken);

        if (!canCreateCustomersForUser(activeUser)) {
          showAlert('You do not have permission to create customers.');
          setTimeout(() => navigation.goBack(), 650);
          setBooting(false);
          return;
        }

        const activeDealerId = getCustomerDealerId(activeUser);
        if (activeDealerId) {
          void loadCustomerCreationSettings(activeDealerId, storedToken)
            .then((settings) => {
              if (active) setCreationSettings(settings);
            })
            .catch((error) => {
              if (__DEV__) console.warn('Failed to load customer creation settings:', error);
            });
        }

        setBooting(false);

        void refreshAuthenticatedUser(storedToken, activeUser)
          .then((freshUser) => {
            if (active) setUser(freshUser);
          })
          .catch((error) => {
            if (__DEV__) console.warn('Failed to refresh create-customer profile:', error);
          });
      } catch {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    };

    void boot();

    return () => {
      active = false;
    };
  }, [navigation, showAlert]);

  useEffect(() => {
    if (!token || usernameManuallyEdited) return;

    const name = normalizeText(form.name);
    const phone = normalizePhone(form.phone);

    if (!name || phone.length < 4) {
      setForm((current) =>
        current.username ? { ...current, username: '' } : current
      );
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const username = await generateCustomerUsername({ name, phone, token });
        if (active) {
          setForm((current) =>
            current.username === username ? current : { ...current, username }
          );
        }
      } catch {
        if (__DEV__) console.warn('Username auto-generation failed');
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.name, form.phone, token, usernameManuallyEdited]);

  useEffect(() => {
    if (!token) return;

    const username = normalizeText(form.username);
    const phone = normalizePhone(form.phone);
    if (!username && !phone) {
      setUsernameError('');
      setPhoneError('');
      setCheckingUnique(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setCheckingUnique(true);
      try {
        const result = await checkCustomerUsernameAndPhone({ username, phone, token });
        if (active) {
          setUsernameError(result.duplicateUsername ? 'Username already exists' : '');
          setPhoneError(result.duplicatePhone ? 'Mobile number already exists' : '');
        }
      } catch {
        if (__DEV__) console.warn('User uniqueness check failed');
      } finally {
        if (active) setCheckingUnique(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.phone, form.username, token]);

  const validate = useCallback(async () => {
    const username = normalizeText(form.username);
    const name = normalizeText(form.name);
    const ledgerName = normalizeText(form.ledger);
    const email = normalizeText(form.email).toLowerCase();
    const phone = normalizePhone(form.phone);

    const standardValues: Record<CustomerStandardFieldKey, string> = {
      username,
      name,
      ledger: ledgerName,
      email,
      phone,
      address: normalizeText(form.address),
      password: form.password,
      confirmPassword: form.confirmPassword,
    };

    for (const key of Object.keys(standardValues) as CustomerStandardFieldKey[]) {
      const rule = creationSettings.fields[key];
      const required = key === 'username' ? Boolean(rule.visible && rule.required) : Boolean(rule.visible && rule.required);
      if (required && !normalizeText(standardValues[key])) {
        showAlert('Please fill all required fields.');
        return false;
      }
    }

    for (const customField of creationSettings.customFields) {
      if (customField.visible && customField.required && !normalizeText(form.custom_fields[customField.key])) {
        showAlert('Please fill all required custom fields.');
        return false;
      }
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert('Enter a valid email address.');
      return false;
    }

    if (phone.length < 10) {
      showAlert('Enter a valid mobile number.');
      return false;
    }

    if (
      creationSettings.fields.password.visible &&
      creationSettings.fields.confirmPassword.visible &&
      (form.password || form.confirmPassword) &&
      form.password !== form.confirmPassword
    ) {
      showAlert('Password and confirm password must match.');
      return false;
    }

    if (checkingUnique) {
      showAlert('Please wait while username and mobile number are checked.');
      return false;
    }

    if (usernameError || phoneError) {
      showAlert(usernameError || phoneError);
      return false;
    }

    try {
      const duplicate = await checkRetailerDuplicates({ username, email, phone, token });
      if (duplicate.duplicateUsername) {
        showAlert(`Username "${username}" is already taken across the system.`);
        return false;
      }
      if (duplicate.duplicateEmail) {
        showAlert(`Email "${email}" is already registered in the system.`);
        return false;
      }
      if (duplicate.duplicatePhone) {
        showAlert(`Mobile number "${phone}" is already registered in the system.`);
        return false;
      }
    } catch {
      if (__DEV__) console.warn('Retailer duplicate check unavailable');
    }

    return true;
  }, [checkingUnique, creationSettings, form, phoneError, showAlert, token, usernameError]);

  const saveCustomer = useCallback(async () => {
    if (saving) return;
    if (!token || !dealerId || !canCreateCustomers) {
      showAlert('You do not have permission to create customers.');
      return;
    }

    const isValid = await validate();
    if (!isValid) return;

    setSaving(true);
    try {
      const result = await createRetailerCustomer({ form, dealerId, token });
      const createdId = result.id;
      const createdCustomer = createdId
        ? {
            id: Number(createdId),
            username: normalizeText(form.username),
            name: normalizeText(form.name),
            ledger: normalizeText(form.ledger),
            email: normalizeText(form.email).toLowerCase(),
            phone: normalizePhone(form.phone),
            address: normalizeText(form.address),
            assigned: dealerId,
            custom_fields: form.custom_fields,
          }
        : null;

      if (createdCustomer) {
        await AsyncStorage.setItem('selectedRetailer', JSON.stringify(createdCustomer));
      }

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'StaffScreen',
            params: {
              activeTab: 'customers',
              refreshCustomersAt: Date.now(),
              createdCustomerId: createdCustomer?.id ?? createdId,
            },
          },
        ],
      });
    } catch (error: any) {
      showAlert(error?.message || 'Failed to add customer.');
    } finally {
      setSaving(false);
    }
  }, [canCreateCustomers, dealerId, form, navigation, saving, showAlert, token, validate]);

  const isStandardFieldVisible = useCallback(
    (key: CustomerStandardFieldKey) => creationSettings.fields[key]?.visible !== false,
    [creationSettings]
  );

  const isStandardFieldRequired = useCallback(
    (key: CustomerStandardFieldKey) => Boolean(creationSettings.fields[key]?.visible && creationSettings.fields[key]?.required),
    [creationSettings]
  );

  const getStandardFieldValue = useCallback(
    (key: CustomerStandardFieldKey) => {
      if (key === 'ledger') return form.ledger;
      return form[key as keyof CustomerFormData] as string;
    },
    [form]
  );

  const updateStandardField = useCallback(
    (key: CustomerStandardFieldKey, value: string) => {
      if (key === 'ledger') {
        updateField('ledger', value);
        return;
      }
      updateField(key as keyof CustomerFormData, value);
    },
    [updateField]
  );

  const renderStandardField = useCallback(
    (key: CustomerStandardFieldKey) => {
      if (!isStandardFieldVisible(key)) return null;
      const meta = STANDARD_FIELD_META[key];
      return (
        <CustomerField
          key={key}
          label={meta.label}
          icon={meta.icon}
          required={isStandardFieldRequired(key)}
          keyboardType={meta.keyboardType}
          secureTextEntry={meta.secureTextEntry}
          value={getStandardFieldValue(key)}
          onChangeText={(value) => {
            if (key === 'username') setUsernameManuallyEdited(true);
            updateStandardField(key, value);
          }}
          placeholder={meta.placeholder}
          error={key === 'username' ? usernameError : key === 'phone' ? phoneError : undefined}
          disableAutofill={key === 'username'}
          autoCapitalize={key === 'username' ? 'none' : undefined}
        />
      );
    },
    [
      getStandardFieldValue,
      isStandardFieldRequired,
      isStandardFieldVisible,
      phoneError,
      updateStandardField,
      usernameError,
    ]
  );

  const renderCustomField = useCallback(
    (field: CustomerCreationSettings['customFields'][number]) => {
      if (!field.visible) return null;
      if (field.type === 'select' && field.options.length > 0) {
        return (
          <View key={field.key} style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              <Ionicons name="list-outline" size={13} color="#94A3B8" /> {field.label}
              {field.required ? <Text style={styles.required}> *</Text> : null}
            </Text>
            <View style={styles.optionWrap}>
              {field.options.map((option) => {
                const selected = form.custom_fields[field.key] === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => updateCustomField(field.key, option)}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}>
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }

      return (
        <CustomerField
          key={field.key}
          label={field.label}
          icon={field.type === 'number' ? 'calculator-outline' : 'reader-outline'}
          required={field.required}
          keyboardType={field.type === 'number' ? 'phone-pad' : 'default'}
          value={form.custom_fields[field.key] || ''}
          onChangeText={(value) => updateCustomField(field.key, value)}
          placeholder={field.label}
        />
      );
    },
    [form.custom_fields, updateCustomField]
  );

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenSkeleton rows={3} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Navbar user={user?.name} />
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        extraScrollHeight={36}
        showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityLabel="Back to customers"
              style={styles.backButton}>
              <Ionicons name="arrow-back" size={21} color={OMS_COLORS.primaryDeep} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Add New Customer</Text>
              <Text style={styles.subtitle}>
                Create a retailer account for this dealer.
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.formTitleRow}>
              <View style={styles.formIcon}>
                <Ionicons name="storefront-outline" size={20} color={OMS_COLORS.primary} />
              </View>
              <Text style={styles.formTitle}>Customer Details</Text>
            </View>

            {STANDARD_CUSTOMER_FIELDS.map(renderStandardField)}
            {creationSettings.customFields.map(renderCustomField)}

            <View style={styles.actions}>
              <Pressable
                disabled={saving}
                onPress={() => navigation.goBack()}
                style={[styles.actionButton, styles.cancelButton]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving || checkingUnique || Boolean(usernameError || phoneError)}
                onPress={saveCustomer}
                style={[
                  styles.actionButton,
                  styles.saveButton,
                  (saving || checkingUnique || Boolean(usernameError || phoneError)) &&
                    styles.saveButtonDisabled,
                ]}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={styles.saveText}>
                      {checkingUnique ? 'Checking...' : 'Add Customer'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
      </KeyboardAwareScrollView>

      <CustomAlert
        visible={alertVisible}
        message={alertMsg}
        onClose={() => setAlertVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OMS_COLORS.surfaceTint,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
  },
  formCard: {
    borderRadius: 18,
    backgroundColor: OMS_COLORS.surfaceTint,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    padding: 16,
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  formIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OMS_COLORS.primarySoft,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: OMS_COLORS.text,
  },
  fieldBlock: {
    marginBottom: 13,
  },
  fieldLabel: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },
  required: {
    color: '#EF4444',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#DCE3EE',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    marginTop: 5,
    fontSize: 12,
    color: '#DC2626',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE3EE',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipSelected: {
    borderColor: OMS_COLORS.primary,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  optionChipTextSelected: {
    color: OMS_COLORS.primaryDeep,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#DCE3EE',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F2937',
  },
  saveButton: {
    backgroundColor: OMS_COLORS.primary,
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
