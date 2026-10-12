import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OMS_COLORS } from '../src/lib/theme';

export type SearchSelectOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  description?: string;
  searchText?: string;
};

type Props<TValue extends string = string> = {
  value: TValue | '';
  options: SearchSelectOption<TValue>[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onChange: (value: TValue | '') => void;
  allowClear?: boolean;
  clearLabel?: string;
  maxVisibleOptions?: number;
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export default function SearchSelect<TValue extends string = string>({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyText = 'No results found',
  onChange,
  allowClear = true,
  clearLabel,
  maxVisibleOptions = 100,
}: Props<TValue>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const query = normalize(search);
    const matches = query
      ? options.filter((option) =>
          normalize([option.label, option.description, option.value, option.searchText].filter(Boolean).join(' ')).includes(query)
        )
      : options;
    return matches.slice(0, maxVisibleOptions);
  }, [maxVisibleOptions, options, search]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={styles.trigger}>
        <Text numberOfLines={1} style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected?.label || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={OMS_COLORS.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={OMS_COLORS.textSubtle} style={styles.searchIcon} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={searchPlaceholder || `Search ${placeholder.toLowerCase()}...`}
                placeholderTextColor={OMS_COLORS.textSubtle}
                autoFocus
                style={styles.searchInput}
              />
            </View>

            <ScrollView style={styles.optionList} keyboardShouldPersistTaps="handled">
              {allowClear ? (
                <Pressable
                  onPress={() => {
                    onChange('');
                    close();
                  }}
                  style={[styles.option, !value && styles.optionSelected]}>
                  <Text style={[styles.optionLabel, !value && styles.optionSelectedText]}>
                    {clearLabel || placeholder}
                  </Text>
                  {!value ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                </Pressable>
              ) : null}

              {filtered.length > 0 ? (
                filtered.map((option) => {
                  const active = option.value === value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        onChange(option.value);
                        close();
                      }}
                      style={[styles.option, active && styles.optionSoftSelected]}>
                      <View style={styles.optionTextWrap}>
                        <Text numberOfLines={1} style={[styles.optionLabel, active && styles.optionSoftSelectedText]}>
                          {option.label}
                        </Text>
                        {option.description ? (
                          <Text numberOfLines={1} style={styles.optionDescription}>
                            {option.description}
                          </Text>
                        ) : null}
                      </View>
                      {active ? <Ionicons name="checkmark" size={18} color={OMS_COLORS.primary} /> : null}
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.empty}>{emptyText}</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function toSearchSelectOptions<TValue extends string = string>(
  values: TValue[]
): SearchSelectOption<TValue>[] {
  return values.map((value) => ({ value, label: value }));
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  triggerText: {
    flex: 1,
    color: OMS_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  placeholder: {
    color: OMS_COLORS.textMuted,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.38)',
    justifyContent: 'center',
    padding: 18,
  },
  panel: {
    maxHeight: '78%',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  searchWrap: {
    margin: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    color: OMS_COLORS.text,
    fontSize: 15,
  },
  optionList: {
    maxHeight: 420,
  },
  option: {
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionSelected: {
    backgroundColor: OMS_COLORS.primary,
  },
  optionSoftSelected: {
    backgroundColor: OMS_COLORS.primarySoft,
  },
  optionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    color: OMS_COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  optionSelectedText: {
    color: '#FFFFFF',
  },
  optionSoftSelectedText: {
    color: OMS_COLORS.primaryDeep,
  },
  optionDescription: {
    marginTop: 2,
    color: OMS_COLORS.textSubtle,
    fontSize: 12,
  },
  empty: {
    color: OMS_COLORS.textSubtle,
    fontSize: 14,
    padding: 24,
    textAlign: 'center',
  },
});
