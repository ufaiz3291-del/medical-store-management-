import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { verifyPinHash } from '../../utils/crypto';

export const PinLockScreen: React.FC = () => {
  const { snapshot, unlockApp } = useStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Enter your administrator PIN.');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const ok = await verifyPinHash(
        pin.trim(),
        snapshot.securityConfig.pinSalt,
        snapshot.securityConfig.pinHash
      );
      if (ok) {
        setPin('');
        unlockApp();
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch {
      setError('Could not verify PIN in this browser context.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-400">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
            {snapshot.storeProfile.storeName}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Administrator PIN required to unlock store records
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="unlock-pin-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Admin PIN
            </label>
            <input
              id="unlock-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={12}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError('');
              }}
              placeholder="Enter PIN"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-center text-lg tracking-[0.25em] font-mono-num text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={verifying}
            className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <ShieldCheck className="w-4 h-4" />
            {verifying ? 'Verifying...' : 'Unlock Store System'}
          </button>
        </form>
      </div>
    </div>
  );
};
