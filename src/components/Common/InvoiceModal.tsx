import React from 'react';
import { Printer, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY, formatPKR } from '../../utils/format';

export const InvoiceModal: React.FC = () => {
  const { activeInvoice, setActiveInvoice, snapshot } = useStore();
  const { storeProfile } = snapshot;

  if (!activeInvoice) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto print:static print:bg-white print:p-0 print:block"
      role="dialog"
      aria-modal="true"
      aria-label={`Invoice ${activeInvoice.invoiceNumber}`}
    >
      <div className="print-surface w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden print:border-0 print:rounded-none print:shadow-none">
        <div className="no-print flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Sales Invoice · {activeInvoice.invoiceNumber}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Invoice
            </button>
            <button
              type="button"
              onClick={() => setActiveInvoice(null)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
              aria-label="Close invoice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Body */}
        <div className="p-6 text-slate-900 dark:text-slate-100 print:text-black print:bg-white print:p-4">
          <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
            <h2 className="text-lg font-bold tracking-tight">{storeProfile.storeName}</h2>
            {storeProfile.tagline && (
              <p className="text-xs text-slate-600 dark:text-slate-400 print:text-black">
                {storeProfile.tagline}
              </p>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-400 print:text-black mt-1">
              {storeProfile.address} · Tel: {storeProfile.phone}
            </p>
            {storeProfile.licenseNumber && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 print:text-black mt-0.5 font-mono-num">
                License: {storeProfile.licenseNumber}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 py-3 text-xs border-b border-dashed border-slate-300 dark:border-slate-700">
            <div>
              <span className="text-slate-500 dark:text-slate-400 print:text-black">Invoice #: </span>
              <span className="font-mono-num font-semibold">{activeInvoice.invoiceNumber}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 dark:text-slate-400 print:text-black">Date: </span>
              <span className="font-mono-num">{formatDateTimeDDMMYYYY(activeInvoice.createdAt)}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 print:text-black">Customer: </span>
              <span className="font-medium">{activeInvoice.customerName}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 dark:text-slate-400 print:text-black">Method: </span>
              <span className="font-medium">{activeInvoice.paymentMethod}</span>
            </div>
          </div>

          <table className="w-full text-xs mt-3">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 print:text-black">
                <th className="py-2 text-left font-semibold">Medicine</th>
                <th className="py-2 text-right font-semibold">Qty</th>
                <th className="py-2 text-right font-semibold">Rate</th>
                <th className="py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
              {activeInvoice.items.map((item, idx) => (
                <tr key={`${item.batchId}_${idx}`}>
                  <td className="py-2 pr-2">
                    <div className="font-medium">{item.medicineName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 print:text-slate-700 font-mono-num">
                      Batch: {item.batchNumber} · Exp: {formatDateDDMMYYYY(item.expiryDate)}
                    </div>
                  </td>
                  <td className="py-2 text-right font-mono-num">{item.quantity}</td>
                  <td className="py-2 text-right font-mono-num">{formatPKR(item.unitSellingPrice)}</td>
                  <td className="py-2 text-right font-mono-num font-medium">{formatPKR(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 pt-3 border-t border-dashed border-slate-300 dark:border-slate-700 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 print:text-black">Subtotal</span>
              <span className="font-mono-num">{formatPKR(activeInvoice.subtotal, true)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 print:text-black">Discount</span>
              <span className="font-mono-num">- {formatPKR(activeInvoice.discount, true)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-200 dark:border-slate-800">
              <span>Total Amount</span>
              <span className="font-mono-num">{formatPKR(activeInvoice.totalAmount, true)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 print:text-black">Amount Paid</span>
              <span className="font-mono-num font-medium">{formatPKR(activeInvoice.amountPaid, true)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Remaining Balance</span>
              <span
                className={`font-mono-num ${
                  activeInvoice.remainingBalance > 0
                    ? 'text-red-600 dark:text-red-400 print:text-black'
                    : ''
                }`}
              >
                {formatPKR(activeInvoice.remainingBalance, true)}
              </span>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-500 dark:text-slate-400 print:text-black">
            <p>Thank you for your trust. Please check medicines & expiry before leaving the counter.</p>
            <p className="mt-0.5">Record & billing receipt only — not a medical prescription.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
