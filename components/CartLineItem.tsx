import { CartSettings, DEFAULT_CART_SETTINGS } from '../src/lib/cartSettings';
import React, { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatCurrency } from '../src/lib/app';
import type { CartRow } from '../src/lib/cart';
import { OMS_COLORS } from '../src/lib/theme';

interface CartLineItemProps {
  onQuantityChange?: (quantity: number) => void;
  settings?: CartSettings;
  row: CartRow;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  onImagePress?: (imageUri: string) => void;
}

const BLUE = OMS_COLORS.primary;
const BLUE_LIGHT = OMS_COLORS.primarySoft;
const BORDER = OMS_COLORS.primaryBorder;
const TEXT_MUTED = '#6B7280';
const RED = '#DC2626';

export default function CartLineItem({
  onQuantityChange,
  row,
  onIncrement,
  onDecrement,
  onRemove,
  onImagePress,
  settings = DEFAULT_CART_SETTINGS,
}: CartLineItemProps) {
  const [draft, setDraft] = useState(String(row.quantity));
  useEffect(() => setDraft(String(row.quantity)), [row.quantity]);
  const commitQuantity = () => {
    const value = Number(draft);
    const quantity = draft.trim() && Number.isSafeInteger(value) && value > 0 ? value : 1;
    setDraft(String(quantity));
    onQuantityChange?.(quantity);
  };
  const visible = settings.visibleDetails;
  const hidden = { display: 'none' as const };
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        {visible.image && row.imageUri ? (
          <Pressable
            disabled={!onImagePress}
            onPress={() => onImagePress?.(row.imageUri!)}
            style={[styles.imageWrap, !visible.image && hidden]}
          >
            <Image source={{ uri: row.imageUri }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ) : visible.image ? (
          <View style={[styles.imageWrap, styles.imagePlaceholder]}>
            <Feather name="image" size={18} color="#9CA3AF" />
          </View>
        ) : null}

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, !visible.productName && hidden]} numberOfLines={2}>
                {row.name}
              </Text>
              {((visible.brand && row.brand) || (visible.model && row.model)) && (
                <Text style={styles.meta} numberOfLines={1}>
                  {[visible.brand ? row.brand : '', visible.model ? row.model : ''].filter(Boolean).join(' • ')}
                </Text>
              )}
            </View>

            <Pressable onPress={onRemove} hitSlop={8} style={[styles.removeBtn, !visible.buttons && hidden]}>
              <Feather name="trash-2" size={16} color={RED} />
            </Pressable>
          </View>

          {visible.category || (visible.variant && row.variantLabel) ? <View style={styles.badgeRow}>
            {visible.category ? <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{row.categoryLabel}</Text>
            </View> : null}
            {visible.variant && row.variantLabel ? (
              <View style={styles.variantBadge}>
                <Text style={styles.variantText}>{row.variantLabel}</Text>
              </View>
            ) : null}
          </View> : null}
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.price, !visible.price && hidden]}>{formatCurrency(row.price)}</Text>
          <Text style={[styles.subtotal, !visible.price && hidden]}>Subtotal {formatCurrency(row.subtotal)}</Text>
        </View>

        <View style={[styles.stepper, !visible.quantity && hidden]}>
          <Pressable onPress={onDecrement} style={styles.stepperBtn} hitSlop={8}>
            <Feather name="minus" size={18} color={BLUE} />
          </Pressable>
          {onQuantityChange ? <TextInput
            style={styles.quantity}
            value={draft}
            keyboardType="number-pad"
            accessibilityLabel={`Quantity for ${row.name}`}
            onChangeText={value => {
              const next = value.replace(/[^0-9]/g, '');
              setDraft(next);
              const quantity = Number(next);
              if (Number.isSafeInteger(quantity) && quantity > 0) onQuantityChange(quantity);
            }}
            onBlur={commitQuantity}
            onSubmitEditing={commitQuantity}
            selectTextOnFocus
          /> : <Text style={styles.quantity}>{row.quantity}</Text>}
          <Pressable
            onPress={onIncrement}
            style={styles.stepperBtn}
            hitSlop={8}
          >
            <Feather name="plus" size={18} color={BLUE} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  imageWrap: {
    width: 78,
    height: 78,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginRight: 12,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titleBlock: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: TEXT_MUTED,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
  },
  variantBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  variantText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: BLUE,
  },
  subtotal: {
    marginTop: 2,
    fontSize: 12,
    color: TEXT_MUTED,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    minWidth: 34,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },
});
