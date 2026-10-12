import { apiUrl } from 'apiurl';

export interface GstSlab {
  id: number;
  dealer_id?: number;
  gst_name: string;
  min_amount: number;
  max_amount: number | null;
  gst_percentage: number;
  effective_from: string;
  status: 'active' | 'inactive';
}

export interface GstLineInput {
  key?: string;
  taxableValue: number;
  slabAmount?: number;
  gstPercentage?: number | null;
}

export interface GstLineSnapshot extends GstLineInput {
  gstPercentage: number;
  gstAmount: number;
  gstSlabId: number | null;
  gstSlabName: string;
  gstSlabMinAmount: number | null;
  gstSlabMaxAmount: number | null;
  missingSlab: boolean;
}

export interface GstSummary {
  taxableValue: number;
  gstPercentage: number;
  gstAmount: number;
  grandTotal: number;
  hasMissingSlab: boolean;
  lines: GstLineSnapshot[];
}

export const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function normalizeGstSlabs(payload: any): GstSlab[] {
  const rows = Array.isArray(payload) ? payload : [];

  return rows
    .map((row) => {
      const maxAmount =
        row?.max_amount === null || row?.max_amount === undefined || row?.max_amount === ''
          ? null
          : Number(row.max_amount);

      return {
        id: Number(row?.id ?? 0),
        dealer_id: row?.dealer_id === undefined ? undefined : Number(row.dealer_id),
        gst_name: String(row?.gst_name ?? row?.name ?? ''),
        min_amount: Number(row?.min_amount ?? 0),
        max_amount: Number.isFinite(maxAmount as number) ? maxAmount : null,
        gst_percentage: Number(row?.gst_percentage ?? row?.percentage ?? 0),
        effective_from: String(row?.effective_from ?? ''),
        status: String(row?.status ?? 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      } satisfies GstSlab;
    })
    .filter((row) => row.id > 0);
}

export function resolveGstSlab(slabAmount: number, slabs: GstSlab[]) {
  const amount = Number(slabAmount || 0);
  const activeSlabs = slabs
    .filter((slab) => slab.status === 'active')
    .sort((left, right) => {
      const dateCompare = String(right.effective_from).localeCompare(String(left.effective_from));
      if (dateCompare !== 0) return dateCompare;
      return Number(right.id || 0) - Number(left.id || 0);
    });

  return activeSlabs.find((slab) => {
    const min = Number(slab.min_amount || 0);
    const max =
      slab.max_amount === null || slab.max_amount === undefined ? null : Number(slab.max_amount);

    return amount >= min && (max === null || amount <= max);
  });
}

export function calculateGstSummary(lines: GstLineInput[], slabs: GstSlab[]): GstSummary {
  const preparedLines = lines.map((line) => {
    const taxableValue = roundMoney(line.taxableValue);
    const slabAmount = line.slabAmount ?? taxableValue;
    const explicitRate = Number(line.gstPercentage);
    const hasExplicitRate = line.gstPercentage !== null && line.gstPercentage !== undefined
      && Number.isFinite(explicitRate) && explicitRate >= 0;
    const slab = hasExplicitRate ? undefined : resolveGstSlab(slabAmount, slabs);
    const gstPercentage = hasExplicitRate ? explicitRate : (slab ? Number(slab.gst_percentage) : 0);
    const gstAmount = roundMoney((taxableValue * gstPercentage) / 100);

    return {
      ...line,
      taxableValue,
      gstPercentage,
      gstAmount,
      gstSlabId: slab?.id ?? null,
      gstSlabName: slab?.gst_name ?? '',
      gstSlabMinAmount: slab?.min_amount ?? null,
      gstSlabMaxAmount: slab?.max_amount ?? null,
      missingSlab: !hasExplicitRate && !slab,
    };
  });

  const taxableValue = roundMoney(
    preparedLines.reduce((sum, line) => sum + line.taxableValue, 0)
  );
  const gstAmount = roundMoney(preparedLines.reduce((sum, line) => sum + line.gstAmount, 0));

  return {
    taxableValue,
    gstAmount,
    gstPercentage: taxableValue > 0 ? roundMoney((gstAmount / taxableValue) * 100) : 0,
    grandTotal: roundMoney(taxableValue + gstAmount),
    hasMissingSlab: preparedLines.some((line) => line.missingSlab),
    lines: preparedLines,
  };
}

async function fetchJsonOrNull(endpoint: string, token?: string | null) {
  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 404) return null;

  const text = await response.text();
  const data = text ? JSON.parse(text) : [];

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String(data.message)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function keepCurrentlyActiveSlabs(slabs: GstSlab[]) {
  const today = new Date().toISOString().slice(0, 10);

  return slabs.filter(
    (slab) =>
      slab.status === 'active' &&
      (!slab.effective_from || String(slab.effective_from).slice(0, 10) <= today)
  );
}

export async function fetchDealerGstSlabs(
  dealerId: string | number,
  token?: string | null
): Promise<GstSlab[]> {
  const encodedDealerId = encodeURIComponent(String(dealerId));
  const endpoints = [
    `/gst-slabs/active?dealerid=${encodedDealerId}`,
    `/gst-slabs?dealerid=${encodedDealerId}`,
    `/gst-settings/active?dealerid=${encodedDealerId}`,
    `/gst-settings?dealerid=${encodedDealerId}`,
  ];

  for (const endpoint of endpoints) {
    const data = await fetchJsonOrNull(endpoint, token);
    if (data === null) continue;

    return keepCurrentlyActiveSlabs(normalizeGstSlabs(data));
  }

  return [];
}
