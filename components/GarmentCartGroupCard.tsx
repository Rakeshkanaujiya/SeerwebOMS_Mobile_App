import { CartSettings, DEFAULT_CART_SETTINGS } from '../src/lib/cartSettings';
import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCurrency } from '../src/lib/app';
import type { GarmentCartGroup } from '../src/lib/cart';
import { cachedImageSource } from '../src/lib/images';
import { OMS_COLORS } from '../src/lib/theme';

interface GarmentCartGroupCardProps {
  settings?: CartSettings;
  group: GarmentCartGroup;
  onIncrementSize: (variantId: number | string, currentQty: number) => void;
  onDecrementSize: (variantId: number | string, currentQty: number) => void;
  onRemoveSize: (variantId: number | string) => void;
  onRemoveProduct: () => void;
  onImagePress?: (imageUri: string) => void;
}

const BLUE = OMS_COLORS.text;
const BLUE_ACCENT = OMS_COLORS.primary;
const BORDER = OMS_COLORS.border;

export default function GarmentCartGroupCard({
  group,
  onIncrementSize,
  onDecrementSize,
  onRemoveSize,
  onRemoveProduct,
  onImagePress,
  settings = DEFAULT_CART_SETTINGS,
}: GarmentCartGroupCardProps) {
  const visible = settings.visibleDetails;
  const hidden = { display: 'none' as const };
  return (
    <View style={styles.card}>
      {visible.image ? (
        <View style={styles.imageShell}>
          {group.imageUri ? (
            <Pressable
              disabled={!onImagePress}
              onPress={() => onImagePress?.(group.imageUri!)}
              style={styles.imagePressable}>
              <Image source={cachedImageSource(group.imageUri)} style={styles.image} resizeMode="contain" />
            </Pressable>
          ) : (
            <View style={styles.placeholder}>
              <Feather name="image" size={20} color="#94A3B8" />
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.name, !visible.productName && hidden]} numberOfLines={2}>
              {group.name}
            </Text>
            {((visible.brand && group.brand) || (visible.model && group.model)) && (
              <Text style={styles.meta}>
                {[visible.brand ? group.brand : '', visible.model ? group.model : ''].filter(Boolean).join(' • ')}
              </Text>
            )}
          </View>
          <Text style={[styles.totalPrice, !visible.price && hidden]}>{formatCurrency(group.subtotal)}</Text>
        </View>

        {visible.category || (visible.variant && group.colorLabel) ? <View style={styles.badges}>
          {visible.category ? <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{group.categoryLabel}</Text>
          </View> : null}
          {visible.variant && group.colorLabel ? (
            <View style={styles.colorBadge}>
              <Text style={styles.colorText}>{group.colorLabel}</Text>
            </View>
          ) : null}
        </View> : null}

        <View style={[styles.setBox, !visible.setCount && hidden]}>
          <Text style={styles.setTitle}>Set Ordering</Text>
          <Text style={styles.setSubtitle}>{group.sizeSummary}</Text>
        </View>

        <View style={styles.gridHeader}>
          <Text style={[styles.headerCell, styles.headerSize]}>Size</Text>
          <Text style={[styles.headerCell, styles.headerQty, !visible.quantity && hidden]}>Qty</Text>
          <Text style={[styles.headerCell, styles.headerPrice, !visible.price && hidden]}>Amount</Text>
          <View style={styles.headerActions} />
        </View>

        {group.sizes.map((size) => {
          const canDecrement = size.quantity > 0;

          return (
            <View key={size.key} style={styles.sizeRow}>
              <View style={styles.sizeChip}>
                <Text style={styles.sizeChipText}>{size.sizeLabel}</Text>
              </View>

              <View style={[styles.stepper, !visible.quantity && hidden]}>
                <Pressable
                  onPress={() => onDecrementSize(size.variantId, size.quantity)}
                  disabled={!canDecrement}
                  style={[styles.stepBtn, !canDecrement && styles.stepBtnDisabled]}>
                  <Feather name="minus" size={15} color={canDecrement ? BLUE_ACCENT : '#94A3B8'} />
                </Pressable>
                <Text style={styles.stepQty}>{size.quantity}</Text>
                <Pressable
                  onPress={() => onIncrementSize(size.variantId, size.quantity)}
                  style={styles.stepBtn}>
                  <Feather name="plus" size={15} color={BLUE_ACCENT} />
                </Pressable>
              </View>

              <View style={[styles.amountBlock, !visible.price && hidden]}>
                <Text style={styles.amount}>{formatCurrency(size.subtotal)}</Text>
              </View>

              <Pressable
                onPress={() => onRemoveSize(size.variantId)}
                disabled={!canDecrement}
                style={[styles.removeBtn, !canDecrement && styles.removeBtnDisabled, !visible.buttons && hidden]}>
                <Feather name="trash-2" size={14} color="#DC2626" />
              </Pressable>
            </View>
          );
        })}

        <View style={styles.footer}>
          <View>
            <Text style={[styles.footerTotal, !visible.quantity && hidden]}>{group.totalQuantity} total pieces</Text>
            <Text style={[styles.footerAmount, !visible.price && hidden]}>{formatCurrency(group.subtotal)}</Text>
          </View>
          <Pressable onPress={onRemoveProduct} hitSlop={8} style={[styles.removeProductBtn, !visible.buttons && hidden]}>
            <Feather name="trash-2" size={14} color="#DC2626" />
            <Text style={styles.removeProductText}>Remove product</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OMS_COLORS.surfaceTint,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: OMS_COLORS.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  imageShell: {
    height: 180,
    backgroundColor: OMS_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePressable: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: 210,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: BLUE,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: BLUE,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: BLUE_ACCENT,
  },
  colorBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: OMS_COLORS.primarySoft,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  colorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  setBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: OMS_COLORS.primaryBorder,
    backgroundColor: OMS_COLORS.primarySoft,
  },
  setTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: OMS_COLORS.primaryDeep,
  },
  setSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerSize: {
    width: 68,
  },
  headerQty: {
    width: 104,
    textAlign: 'center',
  },
  headerPrice: {
    flex: 1,
    textAlign: 'right',
  },
  headerActions: {
    width: 34,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sizeChip: {
    width: 54,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: BLUE,
  },
  stepper: {
    width: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FBFF',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  stepBtnDisabled: {
    backgroundColor: OMS_COLORS.primarySoft,
  },
  stepQty: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  amountBlock: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  removeBtn: {
    width: 32,
    height: 32,
    marginLeft: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  removeBtnDisabled: {
    opacity: 0.35,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  footerTotal: {
    fontSize: 11,
    color: '#64748B',
  },
  footerAmount: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
    color: BLUE,
  },
  removeProductBtn: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#FEF2F2',
  },
  removeProductText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
});
