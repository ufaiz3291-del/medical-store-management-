import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  addDaysISO,
  daysUntilDate,
  exportToCSV,
  formatDateDDMMYYYY,
  formatPKR,
  getExpiryBucket,
  todayISO,
} from '../../utils/format';

type ReportType =
  | 'daily_sales'
  | 'weekly_sales'
  | 'monthly_sales'
  | 'purchases'
  | 'profit'
  | 'low_stock'
  | 'expired'
  | 'near_expiry'
  | 'customer_credit'
  | 'supplier_balances';

const REPORT_OPTIONS: Array<{ id: ReportType; label: string }> = [
  { id: 'daily_sales', label: 'Daily Sales' },
  { id: 'weekly_sales', label: 'Weekly Sales' },
  { id: 'monthly_sales', label: 'Monthly Sales' },
  { id: 'purchases', label: 'Purchase History' },
  { id: 'profit', label: 'Estimated Profit' },
  { id: 'low_stock', label: 'Low-Stock Medicines' },
  { id: 'expired', label: 'Expired Medicines' },
  { id: 'near_expiry', label: 'Near-Expiry (≤ 90d)' },
  { id: 'customer_credit', label: 'Customer Credit' },
  { id: 'supplier_balances', label: 'Supplier Balances' },
];

export const ReportsView: React.FC = () => {
  const { snapshot, medicinesWithBatches, setActiveInvoice } = useStore();
  const today = todayISO();

  const [reportType, setReportType] = useState<ReportType>('daily_sales');
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const [fromDate, setFromDate] = useState(addDaysISO(today, -30));
  const [toDate, setToDate] = useState(today);

  const medMap = useMemo(
    () => new Map(snapshot.medicines.map((m) => [m.id, m])),
    [snapshot.medicines]
  );

  const reportData = useMemo(() => {
    const calcSaleCost = (sale: (typeof snapshot.sales)[number]) =>
      sale.items.reduce((sum, item) => sum + item.unitPurchasePrice * item.quantity, 0);

    switch (reportType) {
      case 'daily_sales': {
        const rows = snapshot.sales.filter((s) => s.date === selectedDate);
        const total = rows.reduce((s, r) => s + r.totalAmount, 0);
        const paid = rows.reduce((s, r) => s + r.amountPaid, 0);
        const credit = rows.reduce((s, r) => s + r.remainingBalance, 0);
        return {
          title: `Daily Sales Report (${formatDateDDMMYYYY(selectedDate)})`,
          summary: [
            { label: 'Invoices', value: String(rows.length) },
            { label: 'Total Sales', value: formatPKR(total, true) },
            { label: 'Collected', value: formatPKR(paid, true) },
            { label: 'Credit Given', value: formatPKR(credit, true) },
          ],
          headers: ['Invoice #', 'Date', 'Customer', 'Payment', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance'],
          csvRows: rows.map((r) => [
            r.invoiceNumber,
            formatDateDDMMYYYY(r.date),
            r.customerName,
            r.paymentMethod,
            r.subtotal,
            r.discount,
            r.totalAmount,
            r.amountPaid,
            r.remainingBalance,
          ]),
          salesRows: rows,
        };
      }
      case 'weekly_sales': {
        const weekStart = addDaysISO(selectedDate, -6);
        const rows = snapshot.sales.filter((s) => s.date >= weekStart && s.date <= selectedDate);
        const total = rows.reduce((s, r) => s + r.totalAmount, 0);
        const paid = rows.reduce((s, r) => s + r.amountPaid, 0);
        return {
          title: `Weekly Sales Report (${formatDateDDMMYYYY(weekStart)} to ${formatDateDDMMYYYY(selectedDate)})`,
          summary: [
            { label: 'Invoices', value: String(rows.length) },
            { label: 'Total Weekly Sales', value: formatPKR(total, true) },
            { label: 'Amount Collected', value: formatPKR(paid, true) },
          ],
          headers: ['Invoice #', 'Date', 'Customer', 'Payment', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance'],
          csvRows: rows.map((r) => [
            r.invoiceNumber,
            formatDateDDMMYYYY(r.date),
            r.customerName,
            r.paymentMethod,
            r.subtotal,
            r.discount,
            r.totalAmount,
            r.amountPaid,
            r.remainingBalance,
          ]),
          salesRows: rows,
        };
      }
      case 'monthly_sales': {
        const rows = snapshot.sales.filter((s) => s.date.startsWith(selectedMonth));
        const total = rows.reduce((s, r) => s + r.totalAmount, 0);
        const paid = rows.reduce((s, r) => s + r.amountPaid, 0);
        return {
          title: `Monthly Sales Report (${selectedMonth})`,
          summary: [
            { label: 'Invoices', value: String(rows.length) },
            { label: 'Monthly Sales', value: formatPKR(total, true) },
            { label: 'Amount Collected', value: formatPKR(paid, true) },
          ],
          headers: ['Invoice #', 'Date', 'Customer', 'Payment', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance'],
          csvRows: rows.map((r) => [
            r.invoiceNumber,
            formatDateDDMMYYYY(r.date),
            r.customerName,
            r.paymentMethod,
            r.subtotal,
            r.discount,
            r.totalAmount,
            r.amountPaid,
            r.remainingBalance,
          ]),
          salesRows: rows,
        };
      }
      case 'purchases': {
        const rows = snapshot.purchases.filter((p) => p.date >= fromDate && p.date <= toDate);
        const total = rows.reduce((s, p) => s + p.totalAmount, 0);
        const paid = rows.reduce((s, p) => s + p.amountPaid, 0);
        return {
          title: `Purchase History (${formatDateDDMMYYYY(fromDate)} to ${formatDateDDMMYYYY(toDate)})`,
          summary: [
            { label: 'Bills', value: String(rows.length) },
            { label: 'Total Purchased', value: formatPKR(total, true) },
            { label: 'Paid', value: formatPKR(paid, true) },
            { label: 'Payable', value: formatPKR(total - paid, true) },
          ],
          headers: ['Date', 'Invoice #', 'Supplier', 'Items', 'Total', 'Paid', 'Balance', 'Status'],
          csvRows: rows.map((p) => [
            formatDateDDMMYYYY(p.date),
            p.supplierInvoiceNumber,
            p.supplierName,
            p.items.length,
            p.totalAmount,
            p.amountPaid,
            p.remainingBalance,
            p.paymentStatus,
          ]),
          purchaseRows: rows,
        };
      }
      case 'profit': {
        const sales = snapshot.sales.filter((s) => s.date >= fromDate && s.date <= toDate);
        const expenses = snapshot.expenses.filter((e) => e.date >= fromDate && e.date <= toDate);
        const revenue = sales.reduce((s, x) => s + x.totalAmount, 0);
        const cogs = sales.reduce((s, x) => s + calcSaleCost(x), 0);
        const grossProfit = revenue - cogs;
        const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
        const netProfit = grossProfit - totalExp;

        return {
          title: `Batch-Accurate Profit Report (${formatDateDDMMYYYY(fromDate)} to ${formatDateDDMMYYYY(toDate)})`,
          summary: [
            { label: 'Net Sales Revenue', value: formatPKR(revenue, true) },
            { label: 'Batch Cost (COGS)', value: formatPKR(cogs, true) },
            { label: 'Gross Profit', value: formatPKR(grossProfit, true) },
            { label: 'Expenses', value: formatPKR(totalExp, true) },
            { label: 'Estimated Net Profit', value: formatPKR(netProfit, true) },
          ],
          headers: ['Invoice #', 'Date', 'Customer', 'Net Sale', 'Batch Cost (COGS)', 'Gross Profit'],
          csvRows: sales.map((s) => {
            const cost = calcSaleCost(s);
            return [
              s.invoiceNumber,
              formatDateDDMMYYYY(s.date),
              s.customerName,
              s.totalAmount,
              Math.round(cost * 100) / 100,
              Math.round((s.totalAmount - cost) * 100) / 100,
            ];
          }),
          profitRows: sales.map((s) => {
            const cost = calcSaleCost(s);
            return { sale: s, cost, profit: s.totalAmount - cost };
          }),
        };
      }
      case 'low_stock': {
        const rows = medicinesWithBatches.filter((m) => m.totalActiveStock <= m.minStockLevel);
        return {
          title: 'Low-Stock Medicines Report',
          summary: [{ label: 'Low / Out of Stock Medicines', value: String(rows.length) }],
          headers: ['Medicine', 'Generic', 'Brand', 'Category', 'Active Stock', 'Min Level', 'Deficit'],
          csvRows: rows.map((m) => [
            m.name,
            m.genericName,
            m.brand,
            m.category,
            m.totalActiveStock,
            m.minStockLevel,
            Math.max(0, m.minStockLevel - m.totalActiveStock),
          ]),
          lowStockRows: rows,
        };
      }
      case 'expired': {
        const rows = snapshot.batches
          .filter((b) => b.quantity > 0 && getExpiryBucket(b.expiryDate) === 'expired')
          .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        const val = rows.reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
        return {
          title: 'Expired Medicines Stock Report',
          summary: [
            { label: 'Expired Batches', value: String(rows.length) },
            { label: 'Cost Value Blocked', value: formatPKR(val, true) },
          ],
          headers: ['Medicine', 'Batch #', 'Expiry Date', 'Days Expired', 'Qty', 'Cost Value'],
          csvRows: rows.map((b) => [
            medMap.get(b.medicineId)?.name || 'Unknown',
            b.batchNumber,
            formatDateDDMMYYYY(b.expiryDate),
            Math.abs(daysUntilDate(b.expiryDate)),
            b.quantity,
            Math.round(b.quantity * b.purchasePrice * 100) / 100,
          ]),
          batchRows: rows,
        };
      }
      case 'near_expiry': {
        const rows = snapshot.batches
          .filter((b) => {
            if (b.quantity <= 0) return false;
            const bk = getExpiryBucket(b.expiryDate);
            return bk === '30days' || bk === '60days' || bk === '90days';
          })
          .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        const val = rows.reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
        return {
          title: 'Near-Expiry Medicines Report (Within 90 Days)',
          summary: [
            { label: 'Near-Expiry Batches', value: String(rows.length) },
            { label: 'Stock Cost at Risk', value: formatPKR(val, true) },
          ],
          headers: ['Medicine', 'Batch #', 'Expiry Date', 'Days Left', 'Qty', 'Cost Value'],
          csvRows: rows.map((b) => [
            medMap.get(b.medicineId)?.name || 'Unknown',
            b.batchNumber,
            formatDateDDMMYYYY(b.expiryDate),
            daysUntilDate(b.expiryDate),
            b.quantity,
            Math.round(b.quantity * b.purchasePrice * 100) / 100,
          ]),
          batchRows: rows,
        };
      }
      case 'customer_credit': {
        const rows = snapshot.customers
          .filter((c) => c.totalCreditBalance > 0)
          .sort((a, b) => b.totalCreditBalance - a.totalCreditBalance);
        const total = rows.reduce((s, c) => s + c.totalCreditBalance, 0);
        return {
          title: 'Customer Credit (Udhaar) Report',
          summary: [
            { label: 'Accounts with Balance', value: String(rows.length) },
            { label: 'Total Outstanding', value: formatPKR(total, true) },
          ],
          headers: ['Customer Name', 'Phone', 'Address', 'Outstanding Balance (PKR)'],
          csvRows: rows.map((c) => [c.name, c.phone, c.address || '', c.totalCreditBalance]),
          customerRows: rows,
        };
      }
      case 'supplier_balances': {
        const rows = snapshot.suppliers
          .filter((s) => s.totalPayableBalance > 0)
          .sort((a, b) => b.totalPayableBalance - a.totalPayableBalance);
        const total = rows.reduce((s, x) => s + x.totalPayableBalance, 0);
        return {
          title: 'Supplier Payable Balances Report',
          summary: [
            { label: 'Suppliers Owed', value: String(rows.length) },
            { label: 'Total Payables', value: formatPKR(total, true) },
          ],
          headers: ['Supplier Name', 'Contact Person', 'Phone', 'Payable Balance (PKR)'],
          csvRows: rows.map((s) => [s.name, s.contactPerson || '', s.phone, s.totalPayableBalance]),
          supplierRows: rows,
        };
      }
    }
  }, [reportType, snapshot, medicinesWithBatches, selectedDate, selectedMonth, fromDate, toDate, medMap]);

  const handleExportCSV = () => {
    const filename = `medledger-${reportType}-${formatDateDDMMYYYY(today)}.csv`;
    exportToCSV(filename, reportData.headers, reportData.csvRows);
  };

  return (
    <div className="space-y-5">
      {/* Report Selector & Actions */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            aria-label="Select report type"
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          {(reportType === 'daily_sales' || reportType === 'weekly_sales') && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-num"
            />
          )}

          {reportType === 'monthly_sales' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-num"
            />
          )}

          {(reportType === 'purchases' || reportType === 'profit') && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="From date"
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-num"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="To date"
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono-num"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Printable Report Surface */}
      <div className="print-surface rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {snapshot.storeProfile.storeName}
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {reportData.title}
            </h2>
          </div>
          <div className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
            Generated: {formatDateDDMMYYYY(today)}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {reportData.summary.map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-3"
            >
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.label}</div>
              <div className="mt-1 text-sm sm:text-base font-bold font-mono-num text-slate-900 dark:text-slate-100">
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Report Table */}
        <div className="overflow-x-auto">
          {reportData.salesRows && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 text-left font-semibold">Invoice #</th>
                  <th className="py-2.5 text-left font-semibold">Date</th>
                  <th className="py-2.5 text-left font-semibold">Customer</th>
                  <th className="py-2.5 text-left font-semibold">Method</th>
                  <th className="py-2.5 text-right font-semibold">Discount</th>
                  <th className="py-2.5 text-right font-semibold">Total</th>
                  <th className="py-2.5 text-right font-semibold">Paid</th>
                  <th className="py-2.5 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.salesRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No sales recorded in this period.
                    </td>
                  </tr>
                ) : (
                  reportData.salesRows.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setActiveInvoice(s)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="py-2.5 font-mono-num font-semibold text-teal-700 dark:text-teal-400">
                        {s.invoiceNumber}
                      </td>
                      <td className="py-2.5 font-mono-num">{formatDateDDMMYYYY(s.date)}</td>
                      <td className="py-2.5">{s.customerName}</td>
                      <td className="py-2.5">{s.paymentMethod}</td>
                      <td className="py-2.5 text-right font-mono-num">{formatPKR(s.discount)}</td>
                      <td className="py-2.5 text-right font-mono-num font-semibold">
                        {formatPKR(s.totalAmount, true)}
                      </td>
                      <td className="py-2.5 text-right font-mono-num">{formatPKR(s.amountPaid, true)}</td>
                      <td className="py-2.5 text-right font-mono-num text-red-600 dark:text-red-400">
                        {formatPKR(s.remainingBalance, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportData.purchaseRows && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 text-left font-semibold">Date</th>
                  <th className="py-2.5 text-left font-semibold">Invoice #</th>
                  <th className="py-2.5 text-left font-semibold">Supplier</th>
                  <th className="py-2.5 text-right font-semibold">Items</th>
                  <th className="py-2.5 text-right font-semibold">Total</th>
                  <th className="py-2.5 text-right font-semibold">Paid</th>
                  <th className="py-2.5 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.purchaseRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No purchases found in this date range.
                    </td>
                  </tr>
                ) : (
                  reportData.purchaseRows.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 font-mono-num">{formatDateDDMMYYYY(p.date)}</td>
                      <td className="py-2.5 font-mono-num font-semibold">{p.supplierInvoiceNumber}</td>
                      <td className="py-2.5">{p.supplierName}</td>
                      <td className="py-2.5 text-right font-mono-num">{p.items.length}</td>
                      <td className="py-2.5 text-right font-mono-num font-semibold">
                        {formatPKR(p.totalAmount, true)}
                      </td>
                      <td className="py-2.5 text-right font-mono-num">{formatPKR(p.amountPaid, true)}</td>
                      <td className="py-2.5 text-right font-mono-num text-amber-600 dark:text-amber-400">
                        {formatPKR(p.remainingBalance, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportData.profitRows && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 text-left font-semibold">Invoice #</th>
                  <th className="py-2.5 text-left font-semibold">Date</th>
                  <th className="py-2.5 text-left font-semibold">Customer</th>
                  <th className="py-2.5 text-right font-semibold">Net Sale</th>
                  <th className="py-2.5 text-right font-semibold">Batch Cost</th>
                  <th className="py-2.5 text-right font-semibold">Gross Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.profitRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No sales recorded in this date range.
                    </td>
                  </tr>
                ) : (
                  reportData.profitRows.map(({ sale, cost, profit }) => (
                    <tr key={sale.id}>
                      <td className="py-2.5 font-mono-num font-semibold">{sale.invoiceNumber}</td>
                      <td className="py-2.5 font-mono-num">{formatDateDDMMYYYY(sale.date)}</td>
                      <td className="py-2.5">{sale.customerName}</td>
                      <td className="py-2.5 text-right font-mono-num">{formatPKR(sale.totalAmount, true)}</td>
                      <td className="py-2.5 text-right font-mono-num text-slate-500">
                        {formatPKR(cost, true)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-mono-num font-semibold ${
                          profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'
                        }`}
                      >
                        {formatPKR(profit, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportData.lowStockRows && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 text-left font-semibold">Medicine</th>
                  <th className="py-2.5 text-left font-semibold">Brand · Category</th>
                  <th className="py-2.5 text-right font-semibold">Active Stock</th>
                  <th className="py-2.5 text-right font-semibold">Min Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.lowStockRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No low-stock medicines.
                    </td>
                  </tr>
                ) : (
                  reportData.lowStockRows.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 font-medium">{m.name}</td>
                      <td className="py-2.5 text-slate-500">
                        {m.brand || '—'} · {m.category}
                      </td>
                      <td className="py-2.5 text-right font-mono-num font-bold text-amber-600">
                        {m.totalActiveStock}
                      </td>
                      <td className="py-2.5 text-right font-mono-num">{m.minStockLevel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportData.batchRows && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 text-left font-semibold">Medicine</th>
                  <th className="py-2.5 text-left font-semibold">Batch #</th>
                  <th className="py-2.5 text-left font-semibold">Expiry Date</th>
                  <th className="py-2.5 text-right font-semibold">Qty</th>
                  <th className="py-2.5 text-right font-semibold">Cost Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.batchRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No batches in this report.
                    </td>
                  </tr>
                ) : (
                  reportData.batchRows.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2.5 font-medium">{medMap.get(b.medicineId)?.name || 'Unknown'}</td>
                      <td className="py-2.5 font-mono-num">{b.batchNumber}</td>
                      <td className="py-2.5 font-mono-num">{formatDateDDMMYYYY(b.expiryDate)}</td>
                      <td className="py-2.5 text-right font-mono-num font-semibold">{b.quantity}</td>
                      <td className="py-2.5 text-right font-mono-num">
                        {formatPKR(b.quantity * b.purchasePrice, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportData.customerRows && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 text-left font-semibold">Customer Name</th>
                  <th className="py-2.5 text-left font-semibold">Phone</th>
                  <th className="py-2.5 text-left font-semibold">Address</th>
                  <th className="py-2.5 text-right font-semibold">Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.customerRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No outstanding customer credit balances.
                    </td>
                  </tr>
                ) : (
                  reportData.customerRows.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 font-medium">{c.name}</td>
                      <td className="py-2.5 font-mono-num">{c.phone}</td>
                      <td className="py-2.5 text-slate-500">{c.address || '—'}</td>
                      <td className="py-2.5 text-right font-mono-num font-bold text-red-600 dark:text-red-400">
                        {formatPKR(c.totalCreditBalance, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportData.supplierRows && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2.5 text-left font-semibold">Supplier Name</th>
                  <th className="py-2.5 text-left font-semibold">Contact Person</th>
                  <th className="py-2.5 text-left font-semibold">Phone</th>
                  <th className="py-2.5 text-right font-semibold">Payable Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.supplierRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No outstanding supplier payables.
                    </td>
                  </tr>
                ) : (
                  reportData.supplierRows.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 font-medium">{s.name}</td>
                      <td className="py-2.5 text-slate-500">{s.contactPerson || '—'}</td>
                      <td className="py-2.5 font-mono-num">{s.phone}</td>
                      <td className="py-2.5 text-right font-mono-num font-bold text-amber-600 dark:text-amber-400">
                        {formatPKR(s.totalPayableBalance, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
