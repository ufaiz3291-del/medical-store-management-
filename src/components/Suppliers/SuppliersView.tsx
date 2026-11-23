import React, { useMemo, useState } from 'react';
import { Building2, CreditCard, Edit3, Plus, Search, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { recordSupplierPayment, saveSupplier } from '../../db/indexedDb';
import { Supplier } from '../../types';
import { formatDateDDMMYYYY, formatPKR, todayISO } from '../../utils/format';

export const SuppliersView: React.FC = () => {
  const { snapshot, refreshData, notify } = useStore();

  const [search, setSearch] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supForm, setSupForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    address: '',
    notes: '',
  });

  const [paymentModalSup, setPaymentModalSup] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalPayables = useMemo(
    () => snapshot.suppliers.reduce((sum, s) => sum + s.totalPayableBalance, 0),
    [snapshot.suppliers]
  );

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.suppliers;
    return snapshot.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (s.contactPerson || '').toLowerCase().includes(q)
    );
  }, [snapshot.suppliers, search]);

  const selectedSupplier = useMemo(
    () => snapshot.suppliers.find((s) => s.id === selectedSupplierId) || null,
    [snapshot.suppliers, selectedSupplierId]
  );

  const selectedHistory = useMemo(() => {
    if (!selectedSupplierId) return [];
    return snapshot.supplierTransactions.filter((t) => t.supplierId === selectedSupplierId);
  }, [snapshot.supplierTransactions, selectedSupplierId]);

  const openAddSupplier = () => {
    setEditingSupplier(null);
    setSupForm({ name: '', contactPerson: '', phone: '', address: '', notes: '' });
    setSupModalOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupForm({
      name: s.name,
      contactPerson: s.contactPerson || '',
      phone: s.phone,
      address: s.address || '',
      notes: s.notes || '',
    });
    setSupModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const saved = await saveSupplier({
        id: editingSupplier?.id,
        ...supForm,
      });
      await refreshData();
      setSelectedSupplierId(saved.id);
      setSupModalOpen(false);
      notify('success', `${editingSupplier ? 'Updated' : 'Registered'} supplier "${saved.name}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save supplier.');
    } finally {
      setSubmitting(false);
    }
  };

  const openPaymentModal = (s: Supplier) => {
    setPaymentModalSup(s);
    setPayAmount(String(s.totalPayableBalance));
    setPayDate(todayISO());
    setPayMethod('Cash');
    setPayNotes('');
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalSup || submitting) return;
    setSubmitting(true);
    try {
      const amount = parseFloat(payAmount || '0');
      await recordSupplierPayment({
        supplierId: paymentModalSup.id,
        amount,
        date: payDate,
        paymentMethod: payMethod,
        notes: payNotes,
      });
      await refreshData();
      notify('success', `Recorded payment of ${formatPKR(amount, true)} to ${paymentModalSup.name}.`);
      setPaymentModalSup(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to record supplier payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-3.5 flex items-center gap-4">
          <Building2 className="w-5 h-5 text-teal-700 dark:text-teal-400" />
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Supplier Payables</div>
            <div className="text-xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
              {formatPKR(totalPayables, true)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-1 sm:max-w-md justify-end">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier or contact..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={openAddSupplier}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Supplier
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">
            Suppliers ({filteredSuppliers.length})
          </div>
          {filteredSuppliers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No suppliers registered yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSuppliers.map((s) => {
                const selected = selectedSupplierId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSupplierId(s.id)}
                    className={`p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      selected
                        ? 'bg-teal-50/70 dark:bg-teal-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {s.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {s.contactPerson ? `${s.contactPerson} · ` : ''}
                        <span className="font-mono-num">{s.phone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div
                          className={`text-sm font-bold font-mono-num ${
                            s.totalPayableBalance > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatPKR(s.totalPayableBalance)}
                        </div>
                        <div className="text-[11px] text-slate-400">Payable</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditSupplier(s);
                        }}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                        aria-label={`Edit ${s.name}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          {!selectedSupplier ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Select a supplier to inspect transaction history and record supplier payments.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedSupplier.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedSupplier.contactPerson ? `${selectedSupplier.contactPerson} · ` : ''}
                    <span className="font-mono-num">{selectedSupplier.phone}</span>
                    {selectedSupplier.address ? ` · ${selectedSupplier.address}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Outstanding Payable</div>
                    <div className="text-lg font-bold font-mono-num text-amber-600 dark:text-amber-400">
                      {formatPKR(selectedSupplier.totalPayableBalance, true)}
                    </div>
                  </div>
                  {selectedSupplier.totalPayableBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(selectedSupplier)}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Pay Supplier
                    </button>
                  )}
                </div>
              </div>

              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Supplier Ledger History ({selectedHistory.length})
              </h3>

              {selectedHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No credit purchases or supplier payments logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 text-left font-semibold">Date</th>
                        <th className="py-2 text-left font-semibold">Type · Invoice</th>
                        <th className="py-2 text-right font-semibold">Amount</th>
                        <th className="py-2 text-right font-semibold">Balance After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedHistory.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-2.5 font-mono-num text-slate-600 dark:text-slate-400">
                            {formatDateDDMMYYYY(tx.date)}
                          </td>
                          <td className="py-2.5">
                            <div className="font-medium">{tx.type}</div>
                            <div className="text-[11px] font-mono-num text-slate-500">
                              {tx.referenceNumber} {tx.paymentMethod ? `· ${tx.paymentMethod}` : ''}
                            </div>
                          </td>
                          <td
                            className={`py-2.5 text-right font-mono-num font-semibold ${
                              tx.type === 'Payment Made'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {tx.type === 'Payment Made' ? '-' : '+'} {formatPKR(tx.amount, true)}
                          </td>
                          <td className="py-2.5 text-right font-mono-num font-medium">
                            {formatPKR(tx.balanceAfter, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Supplier Modal */}
      {supModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">
                {editingSupplier ? `Edit Supplier · ${editingSupplier.name}` : 'Add Supplier'}
              </h3>
              <button type="button" onClick={() => setSupModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSupplier} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Company / Distributor Name *</label>
                <input
                  required
                  value={supForm.name}
                  onChange={(e) => setSupForm({ ...supForm, name: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Contact Person</label>
                <input
                  value={supForm.contactPerson}
                  onChange={(e) => setSupForm({ ...supForm, contactPerson: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone Number *</label>
                <input
                  required
                  value={supForm.phone}
                  onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input
                  value={supForm.address}
                  onChange={(e) => setSupForm({ ...supForm, address: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSupModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Payment Modal */}
      {paymentModalSup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">Pay Supplier</h3>
              <button type="button" onClick={() => setPaymentModalSup(null)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {paymentModalSup.name} · Payable:{' '}
              <span className="font-mono-num font-semibold text-amber-600 dark:text-amber-400">
                {formatPKR(paymentModalSup.totalPayableBalance, true)}
              </span>
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Amount Paid (PKR) *</label>
                <input
                  required
                  type="number"
                  min={1}
                  max={paymentModalSup.totalPayableBalance}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <input
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalSup(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
