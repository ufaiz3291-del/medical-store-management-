export function formatPKR(amount: number, showDecimals = false): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 2,
  }).format(Math.round(safeAmount * 100) / 100);
  return `Rs. ${formatted}`;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const ry = dt.getFullYear();
  const rm = String(dt.getMonth() + 1).padStart(2, '0');
  const rd = String(dt.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export function formatDateDDMMYYYY(dateInput: string | undefined | null): string {
  if (!dateInput) return '—';
  const datePart = dateInput.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return dateInput;
  const d = String(parsed.getDate()).padStart(2, '0');
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const y = parsed.getFullYear();
  return `${d}-${m}-${y}`;
}

export function formatDateTimeDDMMYYYY(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return formatDateDDMMYYYY(isoTimestamp);
  const d = String(parsed.getDate()).padStart(2, '0');
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const y = parsed.getFullYear();
  let hours = parsed.getHours();
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${d}-${m}-${y} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

export function daysUntilDate(targetISO: string, referenceISO: string = todayISO()): number {
  const [ty, tm, td] = targetISO.split('T')[0].split('-').map(Number);
  const [ry, rm, rd] = referenceISO.split('T')[0].split('-').map(Number);
  const targetUtc = Date.UTC(ty, (tm || 1) - 1, td || 1);
  const refUtc = Date.UTC(ry, (rm || 1) - 1, rd || 1);
  return Math.round((targetUtc - refUtc) / (1000 * 60 * 60 * 24));
}

export type ExpiryBucket = 'expired' | '30days' | '60days' | '90days' | 'safe';

export function getExpiryBucket(expiryISO: string): ExpiryBucket {
  const days = daysUntilDate(expiryISO);
  if (days < 0) return 'expired';
  if (days <= 30) return '30days';
  if (days <= 60) return '60days';
  if (days <= 90) return '90days';
  return 'safe';
}

export function isBatchExpired(expiryISO: string): boolean {
  return daysUntilDate(expiryISO) < 0;
}

export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): void {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
