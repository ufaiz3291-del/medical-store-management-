import React, { useMemo, useState } from 'react';
import { History, Search, ShieldAlert } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { InventoryTransactionType } from '../../types';
import { formatDateTimeDDMMYYYY } from '../../utils/format';

const TX_TYPES: InventoryTransactionType[] = [
  'Initial Stock',
  'Purchase',
  'Sale',
  'Return',
  'Damaged',
  'Expired Adjustment',
  'Manual Correction',
];

export const HistoryView: React.FC = () => {
  const { snapshot } = useStore();
  const [tab, setTab] = useState<'inventory' | 'audit'>('inventory');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.inventoryTransactions.filter((t) => {
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
      if (!q) return true;
      return (
        t.medicineName.toLowerCase().includes(q) ||
        (t.batchNumber || '').toLowerCase().includes(q) ||
        t.referenceNumber.toLowerCase().includes(q) ||
        t.reason.toLowerCase().includes(q)
      );
    });
  }, [snapshot.inventoryTransactions, search, typeFilter]);

  const filteredAudit = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.auditLogs;
    return snapshot.auditLogs.filter(
      (a) =>
        a.action.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.entityType.toLowerCase().includes(q)
    );
  }, [snapshot.auditLogs, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setTab('inventory')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'inventory'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Stock Movements ({snapshot.inventoryTransactions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'audit'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Audit Log ({snapshot.auditLogs.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 sm:max-w-lg justify-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, batch, ref #, or reason..."
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          {tab === 'inventory' && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
            >
              <option value="ALL">All Types</option>
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {tab === 'inventory' ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          {filteredTx.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No inventory transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500">
                    <th className="py-3 px-4 text-left font-semibold">Date &amp; Time</th>
                    <th className="py-3 px-3 text-left font-semibold">Medicine · Batch</th>
                    <th className="py-3 px-3 text-left font-semibold">Type</th>
                    <th className="py-3 px-3 text-right font-semibold">Change</th>
                    <th className="py-3 px-3 text-right font-semibold">Before → After</th>
                    <th className="py-3 px-3 text-left font-semibold">Ref #</th>
                    <th className="py-3 px-4 text-left font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTx.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono-num text-slate-500 whitespace-nowrap">
                        {formatDateTimeDDMMYYYY(t.createdAt)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {t.medicineName}
                        </div>
                        <div className="font-mono-num text-[11px] text-slate-500">
                          Batch: {t.batchNumber || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-medium">{t.type}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono-num font-bold ${
                          t.quantityChange > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.quantityChange > 0 ? `+${t.quantityChange}` : t.quantityChange}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-slate-600 dark:text-slate-300">
                        {t.quantityBefore} → {t.quantityAfter}
                      </td>
                      <td className="py-2.5 px-3 font-mono-num text-slate-600 dark:text-slate-400">
                        {t.referenceNumber}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{t.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          {filteredAudit.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No administrative audit records yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500">
                    <th className="py-3 px-4 text-left font-semibold">Timestamp</th>
                    <th className="py-3 px-3 text-left font-semibold">Action</th>
                    <th className="py-3 px-4 text-left font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAudit.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2.5 px-4 font-mono-num text-slate-500 whitespace-nowrap">
                        {formatDateTimeDDMMYYYY(a.timestamp)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-800 dark:text-slate-200">
                        {a.action}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{a.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
