import React, { useMemo, useState } from 'react';
import { Building2, Plus, Trash2, Truck, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  addMedicineWithBatch,
  completePurchaseTransaction,
  saveSupplier,
} from '../../db/indexedDb';
import { MEDICINE_CATEGORIES, MedicineCategory } from '../../types';
import { addDaysISO, formatDateDDMMYYYY, formatPKR, todayISO } from '../../utils/format';

interface PurchaseDraftItem {
  key: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
}

export const PurchasesView: React.FC = () => {
  const { snapshot, refreshData, notify } = useStore();
  const [tab, setTab] = useState<'new' | 'history'>('new');

  // Purchase header
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [paidTouched, setPaidTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseDraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Add item form
  const [selectedMedId, setSelectedMedId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [mfgDate, setMfgDate] = useState(todayISO());
  const [expiryDate, setExpiryDate] = useState(addDaysISO(todayISO(), 365));
  const [qty, setQty] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');

  // Quick Add Supplier Modal
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [supForm, setSupForm] = useState({ name: '', contactPerson: '', phone: '', address: '' });

  // Quick Add Medicine Modal
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [medForm, setMedForm] = useState({
    name: '',
    genericName: '',
    brand: '',
    category: 'Tablets' as MedicineCategory,
    barcode: '',
    minStockLevel: '20',
  });

  const medMap = useMemo(
    () => new Map(snapshot.medicines.map((m) => [m.id, m])),
    [snapshot.medicines]
  );

  const totalAmount = useMemo(
    () =>
      Math.round(items.reduce((sum, i) => sum + i.quantity * i.purchasePrice, 0) * 100) / 100,
    [items]
  );

  const effectiveAmountPaid = useMemo(() => {
    if (!paidTouched) return totalAmount;
    const val = parseFloat(amountPaidInput || '0');
    if (!Number.isFinite(val) || val < 0) return 0;
    return Math.min(totalAmount, Math.round(val * 100) / 100);
  }, [amountPaidInput, paidTouched, totalAmount]);

  const handleAddItemToPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const med = medMap.get(selectedMedId);
    if (!med) {
      notify('error', 'Select a medicine first.');
      return;
    }
    const q = parseInt(qty || '0', 10);
    const pPrice = parseFloat(purchasePrice || '0');
    const sPrice = parseFloat(sellingPrice || '0');

    if (!batchNumber.trim()) {
      notify('error', 'Batch number is required.');
      return;
    }
    if (!expiryDate) {
      notify('error', 'Expiry date is required.');
      return;
    }
    if (!Number.isInteger(q) || q <= 0) {
      notify('error', 'Quantity must be a positive whole number.');
      return;
    }
    if (pPrice < 0 || sPrice < 0) {
      notify('error', 'Prices cannot be negative.');
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        key: `${med.id}_${Date.now()}_${Math.random()}`,
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: batchNumber.trim(),
        manufacturingDate: mfgDate || todayISO(),
        expiryDate,
        quantity: q,
        purchasePrice: pPrice,
        sellingPrice: sPrice,
      },
    ]);

    setSelectedMedId('');
    setBatchNumber('');
    setQty('');
    setPurchasePrice('');
    setSellingPrice('');
  };

  const handleConfirmPurchase = async () => {
    if (submitting) return;
    if (!supplierId) {
      notify('error', 'Please select a supplier.');
      return;
    }
    if (!supplierInvoiceNumber.trim()) {
      notify('error', 'Enter supplier invoice number.');
      return;
    }
    if (items.length === 0) {
      notify('error', 'Add at least one medicine item to this purchase.');
      return;
    }

    setSubmitting(true);
    try {
      const purchase = await completePurchaseTransaction({
        supplierId,
        supplierInvoiceNumber,
        date: purchaseDate,
        amountPaid: effectiveAmountPaid,
        notes,
        items: items.map((i) => ({
          medicineId: i.medicineId,
          medicineName: i.medicineName,
          batchNumber: i.batchNumber,
          manufacturingDate: i.manufacturingDate,
          expiryDate: i.expiryDate,
          quantity: i.quantity,
          purchasePrice: i.purchasePrice,
          sellingPrice: i.sellingPrice,
        })),
      });

      await refreshData();
      setItems([]);
      setSupplierInvoiceNumber('');
      setAmountPaidInput('');
      setPaidTouched(false);
      setNotes('');
      notify(
        'success',
        `Purchase ${purchase.supplierInvoiceNumber} saved (${formatPKR(purchase.totalAmount)}). Stock updated.`
      );
      setTab('history');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save purchase.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sup = await saveSupplier(supForm);
      await refreshData();
      setSupplierId(sup.id);
      setSupModalOpen(false);
      setSupForm({ name: '', contactPerson: '', phone: '', address: '' });
      notify('success', `Supplier "${sup.name}" registered.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save supplier.');
    }
  };

  const handleQuickCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { medicine } = await addMedicineWithBatch({
        medicine: {
          name: medForm.name,
          genericName: medForm.genericName,
          brand: medForm.brand,
          category: medForm.category,
          barcode: medForm.barcode,
          minStockLevel: parseInt(medForm.minStockLevel || '20', 10) || 20,
        },
      });
      await refreshData();
      setSelectedMedId(medicine.id);
      setMedModalOpen(false);
      setMedForm({
        name: '',
        genericName: '',
        brand: '',
        category: 'Tablets',
        barcode: '',
        minStockLevel: '20',
      });
      notify('success', `Medicine "${medicine.name}" added to catalog.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to add medicine.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('new')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'new'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Record New Purchase
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'history'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Purchase History ({snapshot.purchases.length})
        </button>
      </div>

      {tab === 'new' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Add Medicines to Purchase */}
          <div className="xl:col-span-7 space-y-5">
            <form
              onSubmit={handleAddItemToPurchase}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Add Medicine Batch to Purchase
                </h2>
                <button
                  type="button"
                  onClick={() => setMedModalOpen(true)}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> New Medicine
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1">Medicine *</label>
                  <select
                    required
                    value={selectedMedId}
                    onChange={(e) => setSelectedMedId(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="">Select medicine...</option>
                    {snapshot.medicines
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.brand ? `(${m.brand})` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Batch Number *</label>
                  <input
                    required
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="e.g., B-2510"
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Quantity (Units) *</label>
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Manufacturing Date</label>
                  <input
                    type="date"
                    value={mfgDate}
                    onChange={(e) => setMfgDate(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Expiry Date *</label>
                  <input
                    required
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Purchase Price / Unit (PKR) *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Selling Price / Unit (PKR) *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  Add Item to Invoice
                </button>
              </div>
            </form>

            {/* Draft Items Table */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">
                Purchase Invoice Items ({items.length})
              </div>
              {items.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No items added to this purchase invoice yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2.5 px-4 text-left font-semibold">Medicine</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Batch · Exp</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Qty</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Cost</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Subtotal</th>
                        <th className="py-2.5 px-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {items.map((item) => (
                        <tr key={item.key}>
                          <td className="py-2.5 px-4 font-medium">{item.medicineName}</td>
                          <td className="py-2.5 px-3 font-mono-num text-slate-500">
                            {item.batchNumber} · {formatDateDDMMYYYY(item.expiryDate)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono-num">
                            {formatPKR(item.purchasePrice, true)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-num font-semibold">
                            {formatPKR(item.quantity * item.purchasePrice, true)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setItems((prev) => prev.filter((x) => x.key !== item.key))}
                              className="p-1 text-slate-400 hover:text-red-600"
                              aria-label="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

          {/* Right: Supplier & Payment Summary */}
          <div className="xl:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Truck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              Supplier Invoice Details
            </h2>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Supplier *</label>
                <button
                  type="button"
                  onClick={() => setSupModalOpen(true)}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                >
                  <Building2 className="w-3 h-3" /> Register Supplier
                </button>
              </div>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">Select supplier...</option>
                {snapshot.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Supplier Invoice # *</label>
                <input
                  value={supplierInvoiceNumber}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                  placeholder="e.g., LPD-9912"
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Purchase Date *</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Amount Paid to Supplier (PKR)</label>
              <input
                type="number"
                min={0}
                max={totalAmount}
                step="0.01"
                value={paidTouched ? amountPaidInput : String(effectiveAmountPaid)}
                onChange={(e) => {
                  setPaidTouched(true);
                  setAmountPaidInput(e.target.value);
                }}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Notes (Optional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery remarks or terms"
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-sm font-bold">
                <span>Purchase Total</span>
                <span className="font-mono-num">{formatPKR(totalAmount, true)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Paid Now</span>
                <span className="font-mono-num">{formatPKR(effectiveAmountPaid, true)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-600 dark:text-slate-400">Payable Balance</span>
                <span className="font-mono-num text-amber-600 dark:text-amber-400">
                  {formatPKR(Math.max(0, totalAmount - effectiveAmountPaid), true)}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={items.length === 0 || submitting}
              onClick={handleConfirmPurchase}
              className="w-full min-h-[46px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving Purchase...' : 'Confirm Purchase & Increase Stock'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          {snapshot.purchases.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No supplier purchases recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500">
                    <th className="py-3 px-4 text-left font-semibold">Date</th>
                    <th className="py-3 px-3 text-left font-semibold">Invoice #</th>
                    <th className="py-3 px-3 text-left font-semibold">Supplier</th>
                    <th className="py-3 px-3 text-right font-semibold">Items</th>
                    <th className="py-3 px-3 text-right font-semibold">Total</th>
                    <th className="py-3 px-3 text-right font-semibold">Paid</th>
                    <th className="py-3 px-4 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {snapshot.purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono-num text-xs">{formatDateDDMMYYYY(p.date)}</td>
                      <td className="py-3 px-3 font-mono-num font-medium">{p.supplierInvoiceNumber}</td>
                      <td className="py-3 px-3">{p.supplierName}</td>
                      <td className="py-3 px-3 text-right font-mono-num">{p.items.length}</td>
                      <td className="py-3 px-3 text-right font-mono-num font-semibold">
                        {formatPKR(p.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num">
                        {formatPKR(p.amountPaid)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-medium">
                        {p.paymentStatus === 'Paid' ? (
                          <span className="text-emerald-600 dark:text-emerald-400">Paid</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            {p.paymentStatus} · Due {formatPKR(p.remainingBalance)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick Add Supplier Modal */}
      {supModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Register Supplier</h3>
              <button
                type="button"
                onClick={() => setSupModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickCreateSupplier} className="space-y-3">
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
                <label className="block text-xs font-medium mb-1">Phone *</label>
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
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Medicine Modal */}
      {medModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Quick Add Medicine to Catalog</h3>
              <button
                type="button"
                onClick={() => setMedModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickCreateMedicine} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Medicine Name *</label>
                <input
                  required
                  value={medForm.name}
                  onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Generic Name</label>
                  <input
                    value={medForm.genericName}
                    onChange={(e) => setMedForm({ ...medForm, genericName: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Brand</label>
                  <input
                    value={medForm.brand}
                    onChange={(e) => setMedForm({ ...medForm, brand: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <select
                    value={medForm.category}
                    onChange={(e) => setMedForm({ ...medForm, category: e.target.value as MedicineCategory })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {MEDICINE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Min Stock Level</label>
                  <input
                    type="number"
                    min={0}
                    value={medForm.minStockLevel}
                    onChange={(e) => setMedForm({ ...medForm, minStockLevel: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMedModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"
                >
                  Create &amp; Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
