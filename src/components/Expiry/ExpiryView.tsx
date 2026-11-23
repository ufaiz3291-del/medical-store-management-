import React, { useMemo, useState } from 'react';
import { AlertOctagon, ClockAlert, PackageX } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { recordStockAdjustment } from '../../db/indexedDb';
import { daysUntilDate, formatDateDDMMYYYY, formatPKR, getExpiryBucket } from '../../utils/format';

type ExpiryTab = 'expired' | '30days' | '60days' | '90days' | 'all_alerts';

export const ExpiryView: React.FC = () => {
  const { snapshot, refreshData, notify, requestConfirm } = useStore();
  const [tab, setTab] = useState<ExpiryTab>('all_alerts');

  const medMap = useMemo(
    () => new Map(snapshot.medicines.map((m) => [m.id, m])),
    [snapshot.medicines]
  );

  const categorized = useMemo(() => {
    const withStock = snapshot.batches
      .filter((b) => b.quantity > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    const expired = withStock.filter((b) => getExpiryBucket(b.expiryDate) === 'expired');
    const within30 = withStock.filter((b) => getExpiryBucket(b.expiryDate) === '30days');
    const within60 = withStock.filter((b) => {
      const bk = getExpiryBucket(b.expiryDate);
      return bk === '30days' || bk === '60days';
    });
    const within90 = withStock.filter((b) => {
      const bk = getExpiryBucket(b.expiryDate);
      return bk === '30days' || bk === '60days' || bk === '90days';
    });
    const allAlerts = withStock.filter((b) => getExpiryBucket(b.expiryDate) !== 'safe');

    return { expired, within30, within60, within90, allAlerts };
  }, [snapshot.batches]);

  const rows =
    tab === 'expired'
      ? categorized.expired
      : tab === '30days'
        ? categorized.within30
        : tab === '60days'
          ? categorized.within60
          : tab === '90days'
            ? categorized.within90
            : categorized.allAlerts;

  const handleWriteOff = (
    batchId: string,
    medicineName: string,
    batchNumber: string,
    qty: number,
    mode: 'Expired Adjustment' | 'Damaged'
  ) => {
    requestConfirm({
      title: mode === 'Expired Adjustment' ? 'Write Off Expired Batch?' : 'Record Damaged Stock?',
      message: `This will remove all ${qty} units of "${medicineName}" (Batch ${batchNumber}) from active shelf stock and log an immutable "${mode}" entry in Inventory History.`,
      confirmLabel: mode === 'Expired Adjustment' ? 'Write Off Expired' : 'Mark Damaged',
      destructive: true,
      onConfirm: async () => {
        try {
          await recordStockAdjustment({
            batchId,
            medicineName,
            type: mode,
            quantityDelta: -qty,
            reason:
              mode === 'Expired Adjustment'
                ? 'Expired batch written off from Expiry Tracker'
                : 'Damaged stock written off from Expiry Tracker',
          });
          await refreshData();
          notify('success', `Updated stock for "${medicineName}" (${batchNumber}).`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Failed to write off batch.');
        }
      },
    });
  };

  const tabs: Array<{ id: ExpiryTab; label: string; count: number }> = [
    { id: 'all_alerts', label: 'All Alerts', count: categorized.allAlerts.length },
    { id: 'expired', label: 'Expired (Blocked)', count: categorized.expired.length },
    { id: '30days', label: 'Within 30 Days', count: categorized.within30.length },
    { id: '60days', label: 'Within 60 Days', count: categorized.within60.length },
    { id: '90days', label: 'Within 90 Days', count: categorized.within90.length },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Expired Batches</span>
            <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-red-600 dark:text-red-400">
            {categorized.expired.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Blocked from POS sales</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Expiring ≤ 30 Days</span>
            <ClockAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-amber-600 dark:text-amber-400">
            {categorized.within30.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Urgent clearance needed</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Expiring ≤ 60 Days</span>
            <ClockAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {categorized.within60.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Includes ≤ 30d batches</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Expiring ≤ 90 Days</span>
            <ClockAlert className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {categorized.within90.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Total 3-month watchlist</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No medicine batches found in this expiry window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 text-left font-semibold">Medicine</th>
                  <th className="py-3 px-3 text-left font-semibold">Batch #</th>
                  <th className="py-3 px-3 text-left font-semibold">Expiry Date</th>
                  <th className="py-3 px-3 text-left font-semibold">Status</th>
                  <th className="py-3 px-3 text-right font-semibold">Qty</th>
                  <th className="py-3 px-3 text-right font-semibold">Cost Value</th>
                  <th className="py-3 px-4 text-right font-semibold">Write-Off Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((b) => {
                  const med = medMap.get(b.medicineId);
                  const medName = med?.name || 'Unknown Medicine';
                  const days = daysUntilDate(b.expiryDate);
                  const isExpired = days < 0;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{medName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {med?.brand || med?.genericName || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono-num text-xs text-slate-700 dark:text-slate-300">
                        {b.batchNumber}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-xs text-slate-800 dark:text-slate-200">
                        {formatDateDDMMYYYY(b.expiryDate)}
                      </td>
                      <td className="py-3 px-3 text-xs font-medium">
                        {isExpired ? (
                          <span className="text-red-600 dark:text-red-400">
                            Expired ({Math.abs(days)}d ago)
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            Expires in {days} days
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                        {b.quantity}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num text-xs text-slate-700 dark:text-slate-300">
                        {formatPKR(b.quantity * b.purchasePrice)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        {isExpired ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleWriteOff(b.id, medName, b.batchNumber, b.quantity, 'Expired Adjustment')
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:hover:bg-red-900/60 dark:text-red-300 text-xs font-semibold"
                          >
                            <PackageX className="w-3.5 h-3.5" />
                            Write Off Expired
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleWriteOff(b.id, medName, b.batchNumber, b.quantity, 'Damaged')
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium"
                          >
                            Mark Damaged
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
