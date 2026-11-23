import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

export const ConfirmModal: React.FC = () => {
  const { confirmState, closeConfirm } = useStore();
  const [busy, setBusy] = useState(false);

  if (!confirmState) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await confirmState.onConfirm();
      closeConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                confirmState.destructive
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                  : 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {confirmState.title}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {confirmState.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeConfirm}
            disabled={busy}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeConfirm}
            disabled={busy}
            className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60 ${
              confirmState.destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            {busy ? 'Processing...' : confirmState.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
