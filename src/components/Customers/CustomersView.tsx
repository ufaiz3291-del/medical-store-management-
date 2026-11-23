import React, { useMemo, useState } from 'react';
import { CreditCard, Edit3, Plus, Search, Users, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { recordCustomerPayment, saveCustomer } from '../../db/indexedDb';
import { Customer } from '../../types';
import { formatDateDDMMYYYY, formatPKR, todayISO } from '../../utils/format';

export const CustomersView: React.FC = () => {
  const { snapshot, refreshData, notify } = useStore();

  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custForm, setCustForm] = useState({ name: '', phone: '', address: '', notes: '' });

  const [paymentModalCustomer, setPaymentModalCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalOutstanding = useMemo(
    () => snapshot.customers.reduce((sum, c) => sum + c.totalCreditBalance, 0),
    [snapshot.customers]
  );

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.customers;
    return snapshot.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
    );
  }, [snapshot.customers, search]);

  const selectedCustomer = useMemo(
    () => snapshot.customers.find((c) => c.id === selectedCustomerId) || null,
    [snapshot.customers, selectedCustomerId]
  );

  const selectedHistory = useMemo(() => {
    if (!selectedCustomerId) return [];
    return snapshot.customerTransactions.filter((t) => t.customerId === selectedCustomerId);
  }, [snapshot.customerTransactions, selectedCustomerId]);

  const openAddCustomer = () => {
    setEditingCustomer(null);
    setCustForm({ name: '', phone: '', address: '', notes: '' });
    setCustModalOpen(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setCustForm({
      name: c.name,
      phone: c.phone,
      address: c.address || '',
      notes: c.notes || '',
    });
    setCustModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const saved = await saveCustomer({
        id: editingCustomer?.id,
        ...custForm,
      });
      await refreshData();
      setSelectedCustomerId(saved.id);
      setCustModalOpen(false);
      notify('success', `${editingCustomer ? 'Updated' : 'Added'} customer "${saved.name}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSubmitting(false);
    }
  };

  const openPaymentModal = (c: Customer) => {
    setPaymentModalCustomer(c);
    setPayAmount(String(c.totalCreditBalance));
    setPayDate(todayISO());
    setPayMethod('Cash');
    setPayNotes('');
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalCustomer || submitting) return;
    setSubmitting(true);
    try {
      const amount = parseFloat(payAmount || '0');
      await recordCustomerPayment({
        customerId: paymentModalCustomer.id,
        amount,
        date: payDate,
        paymentMethod: payMethod,
        notes: payNotes,
      });
      await refreshData();
      notify('success', `Recorded payment of ${formatPKR(amount, true)} from ${paymentModalCustomer.name}.`);
      setPaymentModalCustomer(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Summary & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-3.5 flex items-center gap-4">
          <Users className="w-5 h-5 text-teal-700 dark:text-teal-400" />
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Customer Credit Receivable</div>
            <div className="text-xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
              {formatPKR(totalOutstanding, true)}
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
              placeholder="Search customer name or phone..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={openAddCustomer}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Customer List */}
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">
            Customers ({filteredCustomers.length})
          </div>
          {filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No customers found. Add a customer to track credit sales and partial payments.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.map((c) => {
                const selected = selectedCustomerId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCustomerId(c.id)}
                    className={`p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      selected
                        ? 'bg-teal-50/70 dark:bg-teal-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {c.name}
                      </div>
                      <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                        {c.phone} {c.address ? `· ${c.address}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div
                          className={`text-sm font-bold font-mono-num ${
                            c.totalCreditBalance > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatPKR(c.totalCreditBalance)}
                        </div>
                        <div className="text-[11px] text-slate-400">Balance</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditCustomer(c);
                        }}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                        aria-label={`Edit ${c.name}`}
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

        {/* Customer Ledger Detail */}
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          {!selectedCustomer ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Select a customer from the list to view their credit ledger and record partial or full payments.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedCustomer.name}
                  </h2>
                  <p className="text-xs font-mono-num text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedCustomer.phone} {selectedCustomer.address ? `· ${selectedCustomer.address}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Remaining Balance</div>
                    <div className="text-lg font-bold font-mono-num text-red-600 dark:text-red-400">
                      {formatPKR(selectedCustomer.totalCreditBalance, true)}
                    </div>
                  </div>
                  {selectedCustomer.totalCreditBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(selectedCustomer)}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Receive Payment
                    </button>
                  )}
                </div>
              </div>

              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Credit &amp; Payment History ({selectedHistory.length})
              </h3>

              {selectedHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No credit or payment transactions recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 text-left font-semibold">Date</th>
                        <th className="py-2 text-left font-semibold">Type · Ref</th>
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
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {tx.type}
                            </div>
                            <div className="text-[11px] font-mono-num text-slate-500">
                              {tx.referenceNumber} {tx.paymentMethod ? `· ${tx.paymentMethod}` : ''}
                            </div>
                          </td>
                          <td
                            className={`py-2.5 text-right font-mono-num font-semibold ${
                              tx.type === 'Payment Received'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {tx.type === 'Payment Received' ? '-' : '+'} {formatPKR(tx.amount, true)}
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

      {/* Add/Edit Customer Modal */}
      {custModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">
                {editingCustomer ? `Edit Customer · ${editingCustomer.name}` : 'Add Customer'}
              </h3>
              <button type="button" onClick={() => setCustModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Full Name *</label>
                <input
                  required
                  value={custForm.name}
                  onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone Number *</label>
                <input
                  required
                  value={custForm.phone}
                  onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                  placeholder="03XX-XXXXXXX"
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input
                  value={custForm.address}
                  onChange={(e) => setCustForm({ ...custForm, address: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <input
                  value={custForm.notes}
                  onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCustModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Payment Modal */}
      {paymentModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">Receive Credit Payment</h3>
              <button
                type="button"
                onClick={() => setPaymentModalCustomer(null)}
                className="p-1 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {paymentModalCustomer.name} · Outstanding:{' '}
              <span className="font-mono-num font-semibold text-red-600 dark:text-red-400">
                {formatPKR(paymentModalCustomer.totalCreditBalance, true)}
              </span>
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Amount Received (PKR) *</label>
                <input
                  required
                  type="number"
                  min={1}
                  max={paymentModalCustomer.totalCreditBalance}
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
                    <option value="EasyPaisa/JazzCash">EasyPaisa / JazzCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <input
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional receipt remarks"
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalCustomer(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
