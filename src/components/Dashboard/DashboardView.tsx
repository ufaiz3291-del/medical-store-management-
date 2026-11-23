import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ClockAlert,
  Database,
  Package,
  Plus,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { seedSamplePakistanPharmacyData } from '../../db/indexedDb';
import {
  addDaysISO,
  daysUntilDate,
  formatDateDDMMYYYY,
  formatPKR,
  getExpiryBucket,
  todayISO,
} from '../../utils/format';

export const DashboardView: React.FC = () => {
  const {
    snapshot,
    medicinesWithBatches,
    setActiveSection,
    setActiveInvoice,
    refreshData,
    notify,
    loading,
  } = useStore();
  const [seeding, setSeeding] = useState(false);
  const [chartDays, setChartDays] = useState<7 | 14>(7);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  const today = todayISO();

  const metrics = useMemo(() => {
    const totalMedicines = snapshot.medicines.length;
    const totalActiveStockQty = medicinesWithBatches.reduce((sum, m) => sum + m.totalActiveStock, 0);
    const totalExpiredStockQty = medicinesWithBatches.reduce((sum, m) => sum + m.totalExpiredStock, 0);

    const todaysSalesList = snapshot.sales.filter((s) => s.date === today);
    const todaysSalesTotal = todaysSalesList.reduce((sum, s) => sum + s.totalAmount, 0);

    const todaysPurchasesList = snapshot.purchases.filter((p) => p.date === today);
    const todaysPurchasesTotal = todaysPurchasesList.reduce((sum, p) => sum + p.totalAmount, 0);

    // Accurate batch-cost profit calculation
    const calcSaleProfit = (sale: (typeof snapshot.sales)[number]) => {
      const revenue = sale.totalAmount;
      const cogs = sale.items.reduce(
        (sum, item) => sum + item.unitPurchasePrice * item.quantity,
        0
      );
      return revenue - cogs;
    };

    const todaysEstimatedProfit = todaysSalesList.reduce((sum, s) => sum + calcSaleProfit(s), 0);
    const totalGrossProfit = snapshot.sales.reduce((sum, s) => sum + calcSaleProfit(s), 0);
    const totalExpenses = snapshot.expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalGrossProfit - totalExpenses;

    const lowStockMedicines = medicinesWithBatches.filter(
      (m) => m.totalActiveStock <= m.minStockLevel
    );

    const activeStockBatches = snapshot.batches.filter((b) => b.quantity > 0);
    const expiredBatches = activeStockBatches.filter(
      (b) => getExpiryBucket(b.expiryDate) === 'expired'
    );
    const nearExpiryBatches = activeStockBatches.filter((b) => {
      const bucket = getExpiryBucket(b.expiryDate);
      return bucket === '30days' || bucket === '60days' || bucket === '90days';
    });

    const outstandingCredit = snapshot.customers.reduce(
      (sum, c) => sum + c.totalCreditBalance,
      0
    );

    return {
      totalMedicines,
      totalActiveStockQty,
      totalExpiredStockQty,
      todaysSalesTotal,
      todaysSalesCount: todaysSalesList.length,
      todaysPurchasesTotal,
      todaysPurchasesCount: todaysPurchasesList.length,
      todaysEstimatedProfit,
      netProfit,
      lowStockMedicines,
      expiredBatches,
      nearExpiryBatches,
      outstandingCredit,
    };
  }, [snapshot, medicinesWithBatches, today]);

  const chartSeries = useMemo(() => {
    const days: Array<{
      iso: string;
      label: string;
      sales: number;
      purchases: number;
      profit: number;
    }> = [];

    for (let i = chartDays - 1; i >= 0; i--) {
      const iso = addDaysISO(today, -i);
      const daySales = snapshot.sales.filter((s) => s.date === iso);
      const dayPurchases = snapshot.purchases.filter((p) => p.date === iso);
      const salesSum = daySales.reduce((s, x) => s + x.totalAmount, 0);
      const purchasesSum = dayPurchases.reduce((s, x) => s + x.totalAmount, 0);
      const profitSum = daySales.reduce((s, sale) => {
        const cogs = sale.items.reduce((cs, it) => cs + it.unitPurchasePrice * it.quantity, 0);
        return s + (sale.totalAmount - cogs);
      }, 0);

      const [, m, d] = iso.split('-');
      days.push({
        iso,
        label: `${d}-${m}`,
        sales: salesSum,
        purchases: purchasesSum,
        profit: profitSum,
      });
    }

    const maxValue = Math.max(
      100,
      ...days.map((d) => Math.max(d.sales, d.purchases, Math.abs(d.profit)))
    );

    return { days, maxValue };
  }, [snapshot.sales, snapshot.purchases, today, chartDays]);

  const medNameMap = useMemo(
    () => new Map(snapshot.medicines.map((m) => [m.id, m.name])),
    [snapshot.medicines]
  );

  const handleLoadSampleData = async () => {
    setSeeding(true);
    try {
      await seedSamplePakistanPharmacyData();
      await refreshData();
      notify('success', 'Sample Pakistani medical store records loaded into IndexedDB.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to load sample data.');
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  const isStoreEmpty = snapshot.medicines.length === 0 && snapshot.sales.length === 0;

  return (
    <div className="space-y-6">
      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Today: <span className="font-mono-num font-medium text-slate-900 dark:text-slate-200">{formatDateDDMMYYYY(today)}</span>
            <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
            <span>All figures calculated from saved local records</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('pos')}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            New Sale
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('purchases')}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium transition-colors"
          >
            <Truck className="w-4 h-4" />
            Record Purchase
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('inventory')}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Medicine
          </button>
        </div>
      </div>

      {/* Empty Store Onboarding Banner */}
      {isStoreEmpty && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Your medical store database is ready
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Start by adding your medicines and supplier purchases, or load realistic Pakistani pharmacy demonstration records to test POS billing, batch expiry tracking, and customer credit ledgers right away.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveSection('inventory')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors"
              >
                Add First Medicine
              </button>
              <button
                type="button"
                onClick={handleLoadSampleData}
                disabled={seeding}
                className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors disabled:opacity-60"
              >
                <Database className="w-4 h-4" />
                {seeding ? 'Loading...' : 'Load Sample Store Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Primary KPI Grid (All 9 Required Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <button
          type="button"
          onClick={() => setActiveSection('inventory')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-teal-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Medicines</span>
            <Package className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {metrics.totalMedicines}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {metrics.totalActiveStockQty} active units in stock
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('pos')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-teal-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Sales</span>
            <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {formatPKR(metrics.todaysSalesTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {metrics.todaysSalesCount} invoices today
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('purchases')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-teal-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Purchases</span>
            <Truck className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {formatPKR(metrics.todaysPurchasesTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {metrics.todaysPurchasesCount} supplier bills today
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('reports')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-teal-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Estimated Profit</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
            {formatPKR(metrics.todaysEstimatedProfit)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Today · All-time net: {formatPKR(metrics.netProfit)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('customers')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-teal-500/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Customer Credit</span>
            <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {formatPKR(metrics.outstandingCredit)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Outstanding receivables
          </div>
        </button>
      </div>

      {/* Alert Summary Strip (Low Stock, Near Expiry, Expired) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setActiveSection('inventory')}
          className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-amber-500/60 transition-colors text-left"
        >
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Low-Stock Medicines
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono-num text-amber-600 dark:text-amber-400">
                {metrics.lowStockMedicines.length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                at or below minimum level
              </span>
            </div>
          </div>
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('expiry')}
          className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-amber-500/60 transition-colors text-left"
        >
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Near-Expiry Batches (≤ 90d)
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono-num text-amber-600 dark:text-amber-400">
                {metrics.nearExpiryBatches.length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                batches expiring soon
              </span>
            </div>
          </div>
          <ClockAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('expiry')}
          className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-red-500/60 transition-colors text-left"
        >
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Expired Medicine Batches
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono-num text-red-600 dark:text-red-400">
                {metrics.expiredBatches.length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                {metrics.totalExpiredStockQty} blocked units
              </span>
            </div>
          </div>
          <ClockAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
        </button>
      </div>

      {/* Charts + Actionable Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Sales, Purchases & Profit Performance Chart */}
        <div className="xl:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Sales, Purchases &amp; Profit Performance
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily PKR totals from saved transactions
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setChartDays(7)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  chartDays === 7
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setChartDays(14)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  chartDays === 14
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Last 14 Days
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400 mb-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-teal-600" />
              Sales
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
              Est. Profit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 dark:bg-slate-600" />
              Purchases
            </span>
          </div>

          {/* Responsive SVG Bar Chart */}
          <div className="relative w-full overflow-x-auto">
            <div className="min-w-[460px]">
              <div className="h-52 flex items-end gap-2 pt-6 pb-2 border-b border-slate-200 dark:border-slate-800">
                {chartSeries.days.map((d) => {
                  const sH = Math.max(2, Math.round((d.sales / chartSeries.maxValue) * 160));
                  const pH = Math.max(2, Math.round((Math.max(0, d.profit) / chartSeries.maxValue) * 160));
                  const purH = Math.max(2, Math.round((d.purchases / chartSeries.maxValue) * 160));
                  const isHovered = hoveredDay === d.iso;

                  return (
                    <div
                      key={d.iso}
                      onMouseEnter={() => setHoveredDay(d.iso)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className="flex-1 flex flex-col items-center justify-end h-full relative group"
                    >
                      {isHovered && (
                        <div className="absolute -top-2 z-20 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-[11px] px-2.5 py-1.5 shadow-lg pointer-events-none">
                          <div className="font-mono-num font-semibold">{formatDateDDMMYYYY(d.iso)}</div>
                          <div className="font-mono-num">Sales: {formatPKR(d.sales)}</div>
                          <div className="font-mono-num text-emerald-300">Profit: {formatPKR(d.profit)}</div>
                          <div className="font-mono-num text-slate-300">Purch: {formatPKR(d.purchases)}</div>
                        </div>
                      )}
                      <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-40">
                        <div
                          style={{ height: `${d.sales > 0 ? sH : 2}px` }}
                          className="w-2.5 sm:w-3.5 rounded-t bg-teal-600 dark:bg-teal-500 transition-all"
                          title={`Sales: ${formatPKR(d.sales)}`}
                        />
                        <div
                          style={{ height: `${d.profit > 0 ? pH : 2}px` }}
                          className="w-2.5 sm:w-3.5 rounded-t bg-emerald-500 dark:bg-emerald-400 transition-all"
                          title={`Profit: ${formatPKR(d.profit)}`}
                        />
                        <div
                          style={{ height: `${d.purchases > 0 ? purH : 2}px` }}
                          className="w-2.5 sm:w-3.5 rounded-t bg-slate-300 dark:bg-slate-600 transition-all"
                          title={`Purchases: ${formatPKR(d.purchases)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-2">
                {chartSeries.days.map((d) => (
                  <div
                    key={d.iso}
                    className="flex-1 text-center text-[11px] font-mono-num text-slate-500 dark:text-slate-400"
                  >
                    {d.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Recent Sales Invoices
            </h2>
            <button
              type="button"
              onClick={() => setActiveSection('reports')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {snapshot.sales.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-sm text-slate-500 dark:text-slate-400">
              <p>No sales recorded yet.</p>
              <button
                type="button"
                onClick={() => setActiveSection('pos')}
                className="mt-3 px-3.5 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold"
              >
                Create First Sale
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {snapshot.sales.slice(0, 6).map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => setActiveInvoice(sale)}
                  className="w-full py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {sale.customerName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                      {sale.invoiceNumber} · {formatDateDDMMYYYY(sale.date)} · {sale.paymentMethod}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold font-mono-num text-slate-900 dark:text-slate-100">
                      {formatPKR(sale.totalAmount)}
                    </div>
                    {sale.remainingBalance > 0 && (
                      <div className="text-[11px] font-mono-num text-red-600 dark:text-red-400">
                        Due: {formatPKR(sale.remainingBalance)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom 2-Column Watchlists: Expiry Alerts & Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiry Alerts Table */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Expiry Alerts
            </h2>
            <button
              type="button"
              onClick={() => setActiveSection('expiry')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
            >
              Manage Expiry <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {metrics.expiredBatches.length === 0 && metrics.nearExpiryBatches.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              No expired or near-expiry batches within the next 90 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 text-left font-semibold">Medicine / Batch</th>
                    <th className="py-2 text-right font-semibold">Qty</th>
                    <th className="py-2 text-right font-semibold">Expiry</th>
                    <th className="py-2 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...metrics.expiredBatches, ...metrics.nearExpiryBatches]
                    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
                    .slice(0, 6)
                    .map((b) => {
                      const days = daysUntilDate(b.expiryDate);
                      return (
                        <tr key={b.id}>
                          <td className="py-2.5 pr-2">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {medNameMap.get(b.medicineId) || 'Unknown'}
                            </div>
                            <div className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                              Batch: {b.batchNumber}
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-mono-num text-slate-800 dark:text-slate-200">
                            {b.quantity}
                          </td>
                          <td className="py-2.5 text-right font-mono-num text-slate-800 dark:text-slate-200">
                            {formatDateDDMMYYYY(b.expiryDate)}
                          </td>
                          <td className="py-2.5 text-right font-medium">
                            {days < 0 ? (
                              <span className="text-red-600 dark:text-red-400">
                                Expired ({Math.abs(days)}d ago)
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">
                                {days}d left
                              </span>
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

        {/* Low Stock Watchlist */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Low-Stock Watchlist
            </h2>
            <button
              type="button"
              onClick={() => setActiveSection('purchases')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
            >
              Restock via Purchase <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {metrics.lowStockMedicines.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              All medicines are stocked above their minimum threshold.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 text-left font-semibold">Medicine</th>
                    <th className="py-2 text-right font-semibold">Active Stock</th>
                    <th className="py-2 text-right font-semibold">Min Level</th>
                    <th className="py-2 text-right font-semibold">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {metrics.lowStockMedicines.slice(0, 6).map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-2">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{m.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.brand || m.genericName}
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                        {m.totalActiveStock}
                      </td>
                      <td className="py-2.5 text-right font-mono-num text-slate-500 dark:text-slate-400">
                        {m.minStockLevel}
                      </td>
                      <td className="py-2.5 text-right font-medium">
                        {m.totalActiveStock === 0 ? (
                          <span className="text-red-600 dark:text-red-400">Out of Stock</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">Low Stock</span>
                        )}
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
