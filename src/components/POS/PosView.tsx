import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { completeSaleTransaction, saveCustomer } from '../../db/indexedDb';
import { MedicineBatch, MedicineWithBatches, PaymentMethod } from '../../types';
import { formatDateDDMMYYYY, formatPKR, isBatchExpired } from '../../utils/format';

interface CartLine {
  medicineId: string;
  medicineName: string;
  genericName: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  maxQty: number;
  unitSellingPrice: number;
  quantity: number;
}

export const PosView: React.FC = () => {
  const {
    medicinesWithBatches,
    snapshot,
    refreshData,
    notify,
    setActiveInvoice,
  } = useStore();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountInput, setDiscountInput] = useState('0');
  const [discountMode, setDiscountMode] = useState<'pkr' | 'pct'>('pkr');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [customerId, setCustomerId] = useState<string>('');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [amountPaidTouched, setAmountPaidTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Quick add customer modal
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  const filteredMeds = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = medicinesWithBatches.filter((m) => m.batches.some((b) => b.quantity > 0));
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.barcode.toLowerCase().includes(q) ||
        m.brand.toLowerCase().includes(q) ||
        m.batches.some((b) => b.batchNumber.toLowerCase().includes(q))
    );
  }, [medicinesWithBatches, search]);

  const subtotal = useMemo(
    () => Math.round(cart.reduce((s, line) => s + line.quantity * line.unitSellingPrice, 0) * 100) / 100,
    [cart]
  );

  const discountPKR = useMemo(() => {
    const raw = parseFloat(discountInput || '0');
    if (!Number.isFinite(raw) || raw < 0) return 0;
    if (discountMode === 'pct') {
      return Math.min(subtotal, Math.round(((subtotal * Math.min(100, raw)) / 100) * 100) / 100);
    }
    return Math.min(subtotal, Math.round(raw * 100) / 100);
  }, [discountInput, discountMode, subtotal]);

  const totalAmount = Math.max(0, Math.round((subtotal - discountPKR) * 100) / 100);

  const effectiveAmountPaid = useMemo(() => {
    if (!amountPaidTouched) {
      return paymentMethod === 'Credit' ? 0 : totalAmount;
    }
    const parsed = parseFloat(amountPaidInput || '0');
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(totalAmount, Math.round(parsed * 100) / 100);
  }, [amountPaidInput, amountPaidTouched, paymentMethod, totalAmount]);

  const remainingBalance = Math.max(
    0,
    Math.round((totalAmount - effectiveAmountPaid) * 100) / 100
  );

  const handleAddBatchToCart = (med: MedicineWithBatches, batch: MedicineBatch) => {
    if (isBatchExpired(batch.expiryDate)) {
      notify(
        'error',
        `Blocked: Batch ${batch.batchNumber} of ${med.name} expired on ${formatDateDDMMYYYY(batch.expiryDate)} and cannot be sold.`
      );
      return;
    }
    if (batch.quantity <= 0) {
      notify('error', `Batch ${batch.batchNumber} is out of stock.`);
      return;
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.batchId === batch.id);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        if (existing.quantity >= batch.quantity) {
          notify('error', `Cannot exceed available stock (${batch.quantity}) for batch ${batch.batchNumber}.`);
          return prev;
        }
        const next = [...prev];
        next[existingIdx] = { ...existing, quantity: existing.quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          medicineId: med.id,
          medicineName: med.name,
          genericName: med.genericName,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          maxQty: batch.quantity,
          unitSellingPrice: batch.sellingPrice,
          quantity: 1,
        },
      ];
    });
  };

  const updateCartQty = (batchId: string, newQty: number) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.batchId !== batchId) return line;
        if (!Number.isFinite(newQty) || newQty < 1) return { ...line, quantity: 1 };
        if (newQty > line.maxQty) {
          notify('error', `Only ${line.maxQty} units available in batch ${line.batchNumber}.`);
          return { ...line, quantity: line.maxQty };
        }
        return { ...line, quantity: Math.floor(newQty) };
      })
    );
  };

  const removeCartLine = (batchId: string) => {
    setCart((prev) => prev.filter((l) => l.batchId !== batchId));
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setAmountPaidTouched(false);
    setAmountPaidInput(method === 'Credit' ? '0' : String(totalAmount));
  };

  const handleCompleteSale = async () => {
    if (submitting || cart.length === 0) return;
    if (remainingBalance > 0 && !customerId) {
      notify('error', 'Please select or add a customer when recording remaining credit balance.');
      return;
    }

    setSubmitting(true);
    try {
      const sale = await completeSaleTransaction({
        items: cart.map((c) => ({
          medicineId: c.medicineId,
          medicineName: c.medicineName,
          genericName: c.genericName,
          batchId: c.batchId,
          quantity: c.quantity,
          unitSellingPrice: c.unitSellingPrice,
        })),
        discount: discountPKR,
        amountPaid: effectiveAmountPaid,
        paymentMethod,
        customerId: customerId || undefined,
        notes,
      });

      await refreshData();
      setCart([]);
      setDiscountInput('0');
      setAmountPaidTouched(false);
      setAmountPaidInput('');
      setCustomerId('');
      setNotes('');
      setPaymentMethod('Cash');
      notify('success', `Sale ${sale.invoiceNumber} saved (${formatPKR(sale.totalAmount)}).`);
      setActiveInvoice(sale);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to complete sale.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cust = await saveCustomer({
        name: newCustName,
        phone: newCustPhone,
        address: newCustAddress,
      });
      await refreshData();
      setCustomerId(cust.id);
      setQuickCustOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');
      notify('success', `Added customer "${cust.name}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save customer.');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Medicine & Batch Catalog */}
      <div className="xl:col-span-7 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine name, generic formula, barcode, or batch #..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-[68vh] overflow-y-auto">
          {filteredMeds.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No stocked medicines match your search.
            </div>
          ) : (
            filteredMeds.map((med) => (
              <div key={med.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {med.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {med.genericName || '—'} · {med.brand || med.category}
                      {med.barcode ? ` · ${med.barcode}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-xs font-mono-num text-slate-500 dark:text-slate-400 shrink-0">
                    Active: <span className="font-semibold text-slate-900 dark:text-slate-100">{med.totalActiveStock}</span>
                  </div>
                </div>

                {/* Batches Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {med.batches
                    .filter((b) => b.quantity > 0)
                    .map((b) => {
                      const expired = isBatchExpired(b.expiryDate);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleAddBatchToCart(med, b)}
                          className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                            expired
                              ? 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/30 cursor-not-allowed'
                              : 'border-slate-200 dark:border-slate-700 hover:border-teal-600 dark:hover:border-teal-500 hover:bg-teal-50/40 dark:hover:bg-teal-950/30'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-mono-num font-semibold text-slate-800 dark:text-slate-200">
                              <span>Batch {b.batchNumber}</span>
                              {expired && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400 font-sans font-bold">
                                  <AlertOctagon className="w-3 h-3" /> EXPIRED
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                              Exp: {formatDateDDMMYYYY(b.expiryDate)} · Qty: {b.quantity}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-mono-num font-bold text-teal-700 dark:text-teal-400">
                              {formatPKR(b.sellingPrice, true)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {expired ? 'Blocked' : '+ Add'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Billing Cart & Checkout */}
      <div className="xl:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 sticky top-20">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            Current Bill ({cart.length} items)
          </h2>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              Clear Bill
            </button>
          )}
        </div>

        {/* Cart Lines */}
        {cart.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            Tap any active medicine batch on the left to add it to this bill.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto pr-1">
            {cart.map((line) => (
              <div key={line.batchId} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {line.medicineName}
                  </div>
                  <div className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                    Batch {line.batchNumber} · {formatPKR(line.unitSellingPrice, true)} each
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateCartQty(line.batchId, line.quantity - 1)}
                    className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={line.maxQty}
                    value={line.quantity}
                    onChange={(e) => updateCartQty(line.batchId, parseInt(e.target.value || '1', 10))}
                    className="w-12 h-7 text-center text-xs font-mono-num font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => updateCartQty(line.batchId, line.quantity + 1)}
                    className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="w-20 text-right text-xs font-mono-num font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                  {formatPKR(line.quantity * line.unitSellingPrice)}
                </div>

                <button
                  type="button"
                  onClick={() => removeCartLine(line.batchId)}
                  className="p-1 text-slate-400 hover:text-red-600"
                  aria-label="Remove item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Customer Selection */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Customer {remainingBalance > 0 ? '(Required for Credit)' : '(Optional)'}
              </label>
              <button
                type="button"
                onClick={() => setQuickCustOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
              >
                <UserPlus className="w-3 h-3" /> New Customer
              </button>
            </div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="">Walk-in Customer</option>
              {snapshot.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone}) — Bal: {formatPKR(c.totalCreditBalance)}
                </option>
              ))}
            </select>
          </div>

          {/* Discount & Payment Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Discount
                </label>
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDiscountMode('pkr')}
                    className={`px-1.5 py-0.5 rounded ${
                      discountMode === 'pkr'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    PKR
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountMode('pct')}
                    className={`px-1.5 py-0.5 rounded ${
                      discountMode === 'pct'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => handlePaymentMethodChange(e.target.value as PaymentMethod)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="Cash">Cash</option>
                <option value="EasyPaisa/JazzCash">EasyPaisa / JazzCash</option>
                <option value="Card/Bank">Card / Bank Transfer</option>
                <option value="Credit">Customer Credit (Udhaar)</option>
              </select>
            </div>
          </div>

          {/* Amount Paid */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Amount Paid (PKR)
            </label>
            <input
              type="number"
              min={0}
              max={totalAmount}
              step="0.01"
              value={amountPaidTouched ? amountPaidInput : String(effectiveAmountPaid)}
              onChange={(e) => {
                setAmountPaidTouched(true);
                setAmountPaidInput(e.target.value);
              }}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num font-semibold"
            />
          </div>

          {/* Totals Summary */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono-num">{formatPKR(subtotal, true)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Discount</span>
              <span className="font-mono-num">- {formatPKR(discountPKR, true)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-200 dark:border-slate-800">
              <span>Net Payable</span>
              <span className="font-mono-num">{formatPKR(totalAmount, true)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-slate-600 dark:text-slate-400">Remaining Credit Balance</span>
              <span
                className={`font-mono-num font-semibold ${
                  remainingBalance > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatPKR(remainingBalance, true)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0 || submitting}
            onClick={handleCompleteSale}
            className="w-full min-h-[46px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {submitting ? 'Completing Sale...' : 'Complete Sale & Generate Invoice'}
          </button>
        </div>
      </div>

      {/* Quick Add Customer Modal */}
      {quickCustOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Quick Add Customer</h3>
              <button
                type="button"
                onClick={() => setQuickCustOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickAddCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Full Name *</label>
                <input
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone Number *</label>
                <input
                  required
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickCustOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
