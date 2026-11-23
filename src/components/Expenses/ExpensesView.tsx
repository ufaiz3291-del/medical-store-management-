import React, { useMemo, useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { addExpenseRecord, deleteExpenseRecord } from '../../db/indexedDb';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../../types';
import { formatDateDDMMYYYY, formatPKR, todayISO } from '../../utils/format';

export const ExpensesView: React.FC = () => {
  const { snapshot, refreshData, notify, requestConfirm } = useStore();

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<ExpenseCategory>('Electricity');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank/Digital'>('Cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const financials = useMemo(() => {
    const grossProfit = snapshot.sales.reduce((sum, sale) => {
      const cogs = sale.items.reduce((s, i) => s + i.unitPurchasePrice * i.quantity, 0);
      return sum + (sale.totalAmount - cogs);
    }, 0);
    const totalExpenses = snapshot.expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;
    return { grossProfit, totalExpenses, netProfit };
  }, [snapshot.sales, snapshot.expenses]);

  const filteredExpenses = useMemo(() => {
    if (categoryFilter === 'ALL') return snapshot.expenses;
    return snapshot.expenses.filter((e) => e.category === categoryFilter);
  }, [snapshot.expenses, categoryFilter]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await addExpenseRecord({
        date,
        category,
        title,
        amount: parseFloat(amount || '0'),
        paymentMethod,
        notes,
      });
      await refreshData();
      setTitle('');
      setAmount('');
      setNotes('');
      notify('success', 'Expense saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to add expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string, expTitle: string) => {
    requestConfirm({
      title: 'Delete Expense Record?',
      message: `Remove "${expTitle}" from business expenses? This action will be recorded in the audit log.`,
      confirmLabel: 'Delete Expense',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteExpenseRecord(id);
          await refreshData();
          notify('success', 'Expense deleted.');
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Unable to delete expense.');
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Financial Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Gross Profit (Sales - Batch Cost)</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {formatPKR(financials.grossProfit, true)}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Operating Expenses</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-red-600 dark:text-red-400">
            {formatPKR(financials.totalExpenses, true)}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Estimated Net Profit</div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono-num ${
              financials.netProfit >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatPKR(financials.netProfit, true)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Record Expense Form */}
        <form
          onSubmit={handleAddExpense}
          className="xl:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3.5"
        >
          <h2 className="text-base font-bold flex items-center gap-2">
            <Receipt className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            Record Store Expense
          </h2>
          <div>
            <label className="block text-xs font-medium mb-1">Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Shop Rent November / LESCO Bill"
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Amount (PKR) *</label>
              <input
                required
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date *</label>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'Cash' | 'Bank/Digital')}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="Cash">Cash</option>
              <option value="Bank/Digital">Bank / Digital</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[42px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            {submitting ? 'Saving...' : 'Save Expense'}
          </button>
        </form>

        {/* Expense Table */}
        <div className="xl:col-span-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold text-sm">Expense Records ({filteredExpenses.length})</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            >
              <option value="ALL">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No business expenses recorded for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500">
                    <th className="py-2.5 px-4 text-left font-semibold">Date</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Category</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Description</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredExpenses.map((ex) => (
                    <tr key={ex.id}>
                      <td className="py-2.5 px-4 font-mono-num text-xs">{formatDateDDMMYYYY(ex.date)}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-300">{ex.category}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{ex.title}</div>
                        {ex.notes && <div className="text-xs text-slate-500">{ex.notes}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-red-600 dark:text-red-400">
                        {formatPKR(ex.amount, true)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(ex.id, ex.title)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                          aria-label={`Delete ${ex.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
