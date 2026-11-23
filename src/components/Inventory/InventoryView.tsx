import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Layers,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  addBatchToExistingMedicine,
  addMedicineWithBatch,
  deleteMedicineSafely,
  recordStockAdjustment,
  updateBatchMetadata,
  updateMedicineInfo,
} from '../../db/indexedDb';
import {
  InventoryTransactionType,
  MEDICINE_CATEGORIES,
  Medicine,
  MedicineBatch,
  MedicineCategory,
  MedicineWithBatches,
} from '../../types';
import {
  addDaysISO,
  daysUntilDate,
  formatDateDDMMYYYY,
  formatPKR,
  getExpiryBucket,
  todayISO,
} from '../../utils/format';

export const InventoryView: React.FC = () => {
  const { medicinesWithBatches, refreshData, notify, requestConfirm } = useStore();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');
  const [expandedMedIds, setExpandedMedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [batchModalMed, setBatchModalMed] = useState<MedicineWithBatches | null>(null);
  const [editingBatch, setEditingBatch] = useState<{ batch: MedicineBatch; medicineName: string } | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ batch: MedicineBatch; medicineName: string } | null>(null);

  // Add/Edit Medicine Form
  const [medForm, setMedForm] = useState({
    name: '',
    genericName: '',
    brand: '',
    category: 'Tablets' as MedicineCategory,
    barcode: '',
    minStockLevel: '20',
    includeInitialBatch: true,
    batchNumber: '',
    manufacturingDate: todayISO(),
    expiryDate: addDaysISO(todayISO(), 365),
    purchasePrice: '',
    sellingPrice: '',
    quantity: '',
  });

  // Add Batch Form
  const [batchForm, setBatchForm] = useState({
    batchNumber: '',
    manufacturingDate: todayISO(),
    expiryDate: addDaysISO(todayISO(), 365),
    purchasePrice: '',
    sellingPrice: '',
    quantity: '',
  });

  // Edit Batch Metadata Form
  const [editBatchForm, setEditBatchForm] = useState({
    batchNumber: '',
    manufacturingDate: '',
    expiryDate: '',
    purchasePrice: '',
    sellingPrice: '',
  });

  // Stock Adjustment Form
  const [adjustForm, setAdjustForm] = useState({
    type: 'Manual Correction' as Extract<
      InventoryTransactionType,
      'Return' | 'Damaged' | 'Expired Adjustment' | 'Manual Correction'
    >,
    direction: 'add' as 'add' | 'deduct',
    quantity: '',
    reason: '',
    referenceNumber: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const uniqueBrands = useMemo(() => {
    const set = new Set<string>();
    for (const m of medicinesWithBatches) {
      if (m.brand.trim()) set.add(m.brand.trim());
    }
    return Array.from(set).sort();
  }, [medicinesWithBatches]);

  const filteredMedicines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return medicinesWithBatches.filter((m) => {
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) return false;
      if (brandFilter !== 'ALL' && m.brand !== brandFilter) return false;
      if (stockFilter === 'LOW' && m.totalActiveStock > m.minStockLevel) return false;
      if (stockFilter === 'OUT' && m.totalActiveStock > 0) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.barcode.toLowerCase().includes(q) ||
        m.brand.toLowerCase().includes(q) ||
        m.batches.some((b) => b.batchNumber.toLowerCase().includes(q))
      );
    });
  }, [medicinesWithBatches, search, categoryFilter, brandFilter, stockFilter]);

  const toggleExpand = (id: string) => {
    setExpandedMedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAddMedicine = () => {
    setEditingMed(null);
    setMedForm({
      name: '',
      genericName: '',
      brand: '',
      category: 'Tablets',
      barcode: '',
      minStockLevel: '20',
      includeInitialBatch: true,
      batchNumber: '',
      manufacturingDate: todayISO(),
      expiryDate: addDaysISO(todayISO(), 365),
      purchasePrice: '',
      sellingPrice: '',
      quantity: '',
    });
    setMedModalOpen(true);
  };

  const openEditMedicine = (med: Medicine) => {
    setEditingMed(med);
    setMedForm({
      name: med.name,
      genericName: med.genericName,
      brand: med.brand,
      category: med.category,
      barcode: med.barcode,
      minStockLevel: String(med.minStockLevel),
      includeInitialBatch: false,
      batchNumber: '',
      manufacturingDate: todayISO(),
      expiryDate: addDaysISO(todayISO(), 365),
      purchasePrice: '',
      sellingPrice: '',
      quantity: '',
    });
    setMedModalOpen(true);
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const minStock = parseInt(medForm.minStockLevel || '0', 10);
      if (editingMed) {
        await updateMedicineInfo({
          ...editingMed,
          name: medForm.name,
          genericName: medForm.genericName,
          brand: medForm.brand,
          category: medForm.category,
          barcode: medForm.barcode,
          minStockLevel: Number.isFinite(minStock) ? minStock : 0,
        });
        notify('success', `Updated "${medForm.name}".`);
      } else {
        await addMedicineWithBatch({
          medicine: {
            name: medForm.name,
            genericName: medForm.genericName,
            brand: medForm.brand,
            category: medForm.category,
            barcode: medForm.barcode,
            minStockLevel: Number.isFinite(minStock) ? minStock : 0,
          },
          initialBatch: medForm.includeInitialBatch
            ? {
                batchNumber: medForm.batchNumber,
                manufacturingDate: medForm.manufacturingDate,
                expiryDate: medForm.expiryDate,
                purchasePrice: parseFloat(medForm.purchasePrice || '0'),
                sellingPrice: parseFloat(medForm.sellingPrice || '0'),
                quantity: parseInt(medForm.quantity || '0', 10),
              }
            : undefined,
        });
        notify('success', `Added "${medForm.name}" to inventory.`);
      }
      await refreshData();
      setMedModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save medicine.');
    } finally {
      setSubmitting(false);
    }
  };

  const openAddBatch = (med: MedicineWithBatches) => {
    setBatchModalMed(med);
    const lastBatch = med.batches[med.batches.length - 1];
    setBatchForm({
      batchNumber: '',
      manufacturingDate: todayISO(),
      expiryDate: addDaysISO(todayISO(), 365),
      purchasePrice: lastBatch ? String(lastBatch.purchasePrice) : '',
      sellingPrice: lastBatch ? String(lastBatch.sellingPrice) : '',
      quantity: '',
    });
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchModalMed || submitting) return;
    setSubmitting(true);
    try {
      await addBatchToExistingMedicine({
        medicineId: batchModalMed.id,
        medicineName: batchModalMed.name,
        batchNumber: batchForm.batchNumber,
        manufacturingDate: batchForm.manufacturingDate,
        expiryDate: batchForm.expiryDate,
        purchasePrice: parseFloat(batchForm.purchasePrice || '0'),
        sellingPrice: parseFloat(batchForm.sellingPrice || '0'),
        quantity: parseInt(batchForm.quantity || '0', 10),
      });
      await refreshData();
      setExpandedMedIds((prev) => new Set(prev).add(batchModalMed.id));
      notify('success', `Batch ${batchForm.batchNumber} added to ${batchModalMed.name}.`);
      setBatchModalMed(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to add batch.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditBatch = (batch: MedicineBatch, medicineName: string) => {
    setEditingBatch({ batch, medicineName });
    setEditBatchForm({
      batchNumber: batch.batchNumber,
      manufacturingDate: batch.manufacturingDate,
      expiryDate: batch.expiryDate,
      purchasePrice: String(batch.purchasePrice),
      sellingPrice: String(batch.sellingPrice),
    });
  };

  const handleUpdateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch || submitting) return;
    setSubmitting(true);
    try {
      await updateBatchMetadata(
        {
          ...editingBatch.batch,
          batchNumber: editBatchForm.batchNumber,
          manufacturingDate: editBatchForm.manufacturingDate,
          expiryDate: editBatchForm.expiryDate,
          purchasePrice: parseFloat(editBatchForm.purchasePrice || '0'),
          sellingPrice: parseFloat(editBatchForm.sellingPrice || '0'),
        },
        editingBatch.medicineName
      );
      await refreshData();
      notify('success', `Updated batch ${editBatchForm.batchNumber}.`);
      setEditingBatch(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update batch.');
    } finally {
      setSubmitting(false);
    }
  };

  const openAdjustStock = (batch: MedicineBatch, medicineName: string) => {
    setAdjustTarget({ batch, medicineName });
    const expired = daysUntilDate(batch.expiryDate) < 0;
    setAdjustForm({
      type: expired ? 'Expired Adjustment' : 'Manual Correction',
      direction: expired ? 'deduct' : 'add',
      quantity: expired ? String(batch.quantity) : '',
      reason: expired ? 'Expired stock removed from shelf' : '',
      referenceNumber: '',
    });
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget || submitting) return;
    setSubmitting(true);
    try {
      const qty = parseInt(adjustForm.quantity || '0', 10);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error('Enter a valid positive whole quantity.');
      }
      const delta = adjustForm.direction === 'deduct' ? -qty : qty;
      await recordStockAdjustment({
        batchId: adjustTarget.batch.id,
        medicineName: adjustTarget.medicineName,
        type: adjustForm.type,
        quantityDelta: delta,
        reason: adjustForm.reason,
        referenceNumber: adjustForm.referenceNumber,
      });
      await refreshData();
      notify('success', `Recorded ${adjustForm.type} for ${adjustTarget.medicineName}.`);
      setAdjustTarget(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Stock adjustment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMedicine = (med: MedicineWithBatches) => {
    requestConfirm({
      title: `Delete "${med.name}"?`,
      message:
        med.totalActiveStock + med.totalExpiredStock > 0
          ? `This medicine still has ${med.totalActiveStock + med.totalExpiredStock} units in stock. Reduce batch quantities to 0 before deleting.`
          : 'This will remove the medicine catalog entry permanently. Past invoices and transaction history will remain intact.',
      confirmLabel: 'Delete Medicine',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteMedicineSafely(med.id);
          await refreshData();
          notify('success', `Deleted "${med.name}".`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Unable to delete medicine.');
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Search, Filters & Primary CTA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, generic, barcode, or batch..."
              className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">All Categories</option>
            {MEDICINE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            aria-label="Filter by manufacturer"
            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">All Manufacturers</option>
            {uniqueBrands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(['ALL', 'LOW', 'OUT'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStockFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  stockFilter === st
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {st === 'ALL' ? 'All' : st === 'LOW' ? 'Low Stock' : 'Out of Stock'}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={openAddMedicine}
          className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Medicine
        </button>
      </div>

      {/* Medicines Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {filteredMedicines.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {medicinesWithBatches.length === 0
                ? 'No medicines in inventory yet.'
                : 'No medicines match your current search or filters.'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Add a medicine with its opening batch or record a supplier purchase.
            </p>
            <button
              type="button"
              onClick={openAddMedicine}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add New Medicine
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 text-left font-semibold">Medicine &amp; Generic</th>
                  <th className="py-3 px-3 text-left font-semibold">Category · Brand</th>
                  <th className="py-3 px-3 text-left font-semibold">Code / Barcode</th>
                  <th className="py-3 px-3 text-right font-semibold">Active Stock</th>
                  <th className="py-3 px-3 text-right font-semibold">Batches</th>
                  <th className="py-3 px-3 text-right font-semibold">Next Expiry</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMedicines.map((med) => {
                  const isExpanded = expandedMedIds.has(med.id);
                  const isLow = med.totalActiveStock <= med.minStockLevel;
                  const isOut = med.totalActiveStock === 0;

                  return (
                    <React.Fragment key={med.id}>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleExpand(med.id)}
                            className="flex items-start gap-2 text-left group"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                            )}
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-400">
                                {med.name}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {med.genericName || '—'}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                          <div>{med.category}</div>
                          <div className="text-slate-400 dark:text-slate-500">{med.brand || '—'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono-num text-xs text-slate-600 dark:text-slate-300">
                          {med.barcode || '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div
                            className={`font-mono-num font-semibold ${
                              isOut
                                ? 'text-red-600 dark:text-red-400'
                                : isLow
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {med.totalActiveStock}
                          </div>
                          <div className="text-[11px] font-mono-num text-slate-400">
                            Min: {med.minStockLevel}
                            {med.totalExpiredStock > 0 && (
                              <span className="text-red-500 ml-1">· {med.totalExpiredStock} exp</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-xs text-slate-600 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleExpand(med.id)}
                            className="inline-flex items-center gap-1 hover:text-teal-700 dark:hover:text-teal-400 underline-offset-2 hover:underline"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            {med.batches.length}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-num text-xs text-slate-700 dark:text-slate-300">
                          {med.earliestActiveExpiry ? formatDateDDMMYYYY(med.earliestActiveExpiry) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openAddBatch(med)}
                              title="Add new batch"
                              className="p-2 rounded-lg text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60"
                              aria-label={`Add batch to ${med.name}`}
                            >
                              <PackagePlus className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditMedicine(med)}
                              title="Edit medicine info"
                              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              aria-label={`Edit ${med.name}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMedicine(med)}
                              title="Delete medicine"
                              className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                              aria-label={`Delete ${med.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Multi-Batch List */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 dark:bg-slate-950/50">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Batches for {med.name} ({med.batches.length})
                              </span>
                              <button
                                type="button"
                                onClick={() => openAddBatch(med)}
                                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add Batch
                              </button>
                            </div>
                            {med.batches.length === 0 ? (
                              <p className="text-xs text-slate-500 py-2">
                                No batches recorded yet. Click Add Batch or record a Supplier Purchase.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                                      <th className="py-2 px-3 text-left font-semibold">Batch #</th>
                                      <th className="py-2 px-3 text-left font-semibold">Mfg Date</th>
                                      <th className="py-2 px-3 text-left font-semibold">Expiry Date</th>
                                      <th className="py-2 px-3 text-right font-semibold">Purchase</th>
                                      <th className="py-2 px-3 text-right font-semibold">Selling</th>
                                      <th className="py-2 px-3 text-right font-semibold">Qty</th>
                                      <th className="py-2 px-3 text-left font-semibold">Status</th>
                                      <th className="py-2 px-3 text-right font-semibold">Batch Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {med.batches.map((b) => {
                                      const bucket = getExpiryBucket(b.expiryDate);
                                      const days = daysUntilDate(b.expiryDate);
                                      return (
                                        <tr key={b.id}>
                                          <td className="py-2 px-3 font-mono-num font-medium text-slate-900 dark:text-slate-100">
                                            {b.batchNumber}
                                          </td>
                                          <td className="py-2 px-3 font-mono-num text-slate-600 dark:text-slate-400">
                                            {formatDateDDMMYYYY(b.manufacturingDate)}
                                          </td>
                                          <td className="py-2 px-3 font-mono-num text-slate-800 dark:text-slate-200">
                                            {formatDateDDMMYYYY(b.expiryDate)}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono-num text-slate-600 dark:text-slate-400">
                                            {formatPKR(b.purchasePrice, true)}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono-num font-medium text-slate-900 dark:text-slate-100">
                                            {formatPKR(b.sellingPrice, true)}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                                            {b.quantity}
                                          </td>
                                          <td className="py-2 px-3 font-medium">
                                            {bucket === 'expired' ? (
                                              <span className="text-red-600 dark:text-red-400">
                                                Expired ({Math.abs(days)}d ago)
                                              </span>
                                            ) : bucket === 'safe' ? (
                                              <span className="text-emerald-600 dark:text-emerald-400">
                                                Active
                                              </span>
                                            ) : (
                                              <span className="text-amber-600 dark:text-amber-400">
                                                Expiring in {days}d
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 text-right whitespace-nowrap">
                                            <button
                                              type="button"
                                              onClick={() => openEditBatch(b, med.name)}
                                              className="text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-400 mr-3 font-medium"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openAdjustStock(b, med.name)}
                                              className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline font-medium"
                                            >
                                              <SlidersHorizontal className="w-3 h-3" /> Adjust Stock
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Medicine Modal */}
      {medModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingMed ? `Edit Medicine · ${editingMed.name}` : 'Add New Medicine'}
              </h2>
              <button
                type="button"
                onClick={() => setMedModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMedicine} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Medicine Name *
                  </label>
                  <input
                    required
                    value={medForm.name}
                    onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                    placeholder="e.g., Panadol 500mg Tablets"
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Generic / Formula Name
                  </label>
                  <input
                    value={medForm.genericName}
                    onChange={(e) => setMedForm({ ...medForm, genericName: e.target.value })}
                    placeholder="e.g., Paracetamol"
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Brand / Company
                  </label>
                  <input
                    value={medForm.brand}
                    onChange={(e) => setMedForm({ ...medForm, brand: e.target.value })}
                    placeholder="e.g., GSK Pakistan"
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
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
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Barcode / Medicine Code
                  </label>
                  <input
                    value={medForm.barcode}
                    onChange={(e) => setMedForm({ ...medForm, barcode: e.target.value })}
                    placeholder="Scan or enter code"
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Minimum Stock Alert Level *
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={medForm.minStockLevel}
                    onChange={(e) => setMedForm({ ...medForm, minStockLevel: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>

              {!editingMed && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={medForm.includeInitialBatch}
                      onChange={(e) => setMedForm({ ...medForm, includeInitialBatch: e.target.checked })}
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    Include opening batch details now
                  </label>

                  {medForm.includeInitialBatch && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Batch Number *
                        </label>
                        <input
                          required
                          value={medForm.batchNumber}
                          onChange={(e) => setMedForm({ ...medForm, batchNumber: e.target.value })}
                          placeholder="e.g., B-2501"
                          className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Mfg Date
                        </label>
                        <input
                          type="date"
                          value={medForm.manufacturingDate}
                          onChange={(e) => setMedForm({ ...medForm, manufacturingDate: e.target.value })}
                          className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Expiry Date *
                        </label>
                        <input
                          required
                          type="date"
                          value={medForm.expiryDate}
                          onChange={(e) => setMedForm({ ...medForm, expiryDate: e.target.value })}
                          className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Purchase Price (PKR) *
                        </label>
                        <input
                          required
                          type="number"
                          min={0}
                          step="0.01"
                          value={medForm.purchasePrice}
                          onChange={(e) => setMedForm({ ...medForm, purchasePrice: e.target.value })}
                          className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Selling Price (PKR) *
                        </label>
                        <input
                          required
                          type="number"
                          min={0}
                          step="0.01"
                          value={medForm.sellingPrice}
                          onChange={(e) => setMedForm({ ...medForm, sellingPrice: e.target.value })}
                          className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Quantity (Units) *
                        </label>
                        <input
                          required
                          type="number"
                          min={0}
                          step={1}
                          value={medForm.quantity}
                          onChange={(e) => setMedForm({ ...medForm, quantity: e.target.value })}
                          className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMedModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingMed ? 'Save Changes' : 'Add Medicine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Batch Modal */}
      {batchModalMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add Batch · {batchModalMed.name}
              </h2>
              <button
                type="button"
                onClick={() => setBatchModalMed(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBatch} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Batch Number *</label>
                <input
                  required
                  value={batchForm.batchNumber}
                  onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Mfg Date</label>
                  <input
                    type="date"
                    value={batchForm.manufacturingDate}
                    onChange={(e) => setBatchForm({ ...batchForm, manufacturingDate: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Expiry Date *</label>
                  <input
                    required
                    type="date"
                    value={batchForm.expiryDate}
                    onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Purchase PKR *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={batchForm.purchasePrice}
                    onChange={(e) => setBatchForm({ ...batchForm, purchasePrice: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Selling PKR *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={batchForm.sellingPrice}
                    onChange={(e) => setBatchForm({ ...batchForm, sellingPrice: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Quantity *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    value={batchForm.quantity}
                    onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBatchModalMed(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
                >
                  {submitting ? 'Adding...' : 'Add Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Batch Metadata Modal */}
      {editingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Edit Batch · {editingBatch.medicineName}
              </h2>
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateBatch} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Batch Number *</label>
                <input
                  required
                  value={editBatchForm.batchNumber}
                  onChange={(e) => setEditBatchForm({ ...editBatchForm, batchNumber: e.target.value })}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Mfg Date</label>
                  <input
                    type="date"
                    value={editBatchForm.manufacturingDate}
                    onChange={(e) => setEditBatchForm({ ...editBatchForm, manufacturingDate: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Expiry Date *</label>
                  <input
                    required
                    type="date"
                    value={editBatchForm.expiryDate}
                    onChange={(e) => setEditBatchForm({ ...editBatchForm, expiryDate: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Purchase Price (PKR) *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={editBatchForm.purchasePrice}
                    onChange={(e) => setEditBatchForm({ ...editBatchForm, purchasePrice: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Selling Price (PKR) *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={editBatchForm.sellingPrice}
                    onChange={(e) => setEditBatchForm({ ...editBatchForm, sellingPrice: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                To change stock quantity, use &quot;Adjust Stock&quot; so every change is logged in Inventory History.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
                >
                  {submitting ? 'Saving...' : 'Save Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment / Damaged / Return Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Adjust Stock · {adjustTarget.medicineName}
              </h2>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-mono-num">
              Batch: {adjustTarget.batch.batchNumber} · Current Qty: {adjustTarget.batch.quantity}
            </p>

            <form onSubmit={handleConfirmAdjustment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Adjustment Type *</label>
                <select
                  value={adjustForm.type}
                  onChange={(e) => {
                    const t = e.target.value as typeof adjustForm.type;
                    setAdjustForm({
                      ...adjustForm,
                      type: t,
                      direction: t === 'Return' ? 'add' : t === 'Damaged' || t === 'Expired Adjustment' ? 'deduct' : adjustForm.direction,
                    });
                  }}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="Manual Correction">Manual Stock Correction</option>
                  <option value="Return">Customer / Shelf Return (+)</option>
                  <option value="Damaged">Damaged Stock Write-off (-)</option>
                  <option value="Expired Adjustment">Expired Stock Write-off (-)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Direction</label>
                  <select
                    value={adjustForm.direction}
                    onChange={(e) => setAdjustForm({ ...adjustForm, direction: e.target.value as 'add' | 'deduct' })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="add">Add (+)</option>
                    <option value="deduct">Deduct (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Quantity *</label>
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    value={adjustForm.quantity}
                    onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                    className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Reference # (Optional)</label>
                <input
                  value={adjustForm.referenceNumber}
                  onChange={(e) => setAdjustForm({ ...adjustForm, referenceNumber: e.target.value })}
                  placeholder="e.g., INV-01002 or DMG-01"
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Reason *</label>
                <input
                  required
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  placeholder="Explain why stock is being adjusted"
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
                >
                  {submitting ? 'Recording...' : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
