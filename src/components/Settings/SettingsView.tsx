import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Download,
  Lock,
  ShieldCheck,
  Smartphone,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  clearAllDatabaseRecords,
  DEFAULT_SECURITY_CONFIG,
  exportBackupPayload,
  seedSamplePakistanPharmacyData,
  setSetting,
  validateAndRestoreBackup,
} from '../../db/indexedDb';
import { SecurityConfig, StoreProfile } from '../../types';
import { generateSalt, hashPin, verifyPinHash } from '../../utils/crypto';
import { formatDateDDMMYYYY, todayISO } from '../../utils/format';
import { PWAInstallButton } from '../Layout/PWAInstallButton';

export const SettingsView: React.FC = () => {
  const { snapshot, refreshData, notify, requestConfirm, lockApp } = useStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<StoreProfile>(snapshot.storeProfile);
  const [savingProfile, setSavingProfile] = useState(false);

  // PIN Security state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const [busyBackup, setBusyBackup] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.storeName.trim()) {
      notify('error', 'Store name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    try {
      await setSetting(
        'storeProfile',
        {
          ...profile,
          storeName: profile.storeName.trim(),
          tagline: profile.tagline.trim(),
          phone: profile.phone.trim(),
          address: profile.address.trim(),
          licenseNumber: profile.licenseNumber.trim(),
        },
        `Updated store profile for "${profile.storeName.trim()}".`
      );
      await refreshData();
      notify('success', 'Store profile saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save store profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSetOrChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4 || !/^\d+$/.test(newPin)) {
      notify('error', 'Admin PIN must be at least 4 digits (numbers only).');
      return;
    }
    if (newPin !== confirmPin) {
      notify('error', 'New PIN and confirmation do not match.');
      return;
    }

    setSavingPin(true);
    try {
      if (snapshot.securityConfig.pinEnabled) {
        const ok = await verifyPinHash(
          currentPin,
          snapshot.securityConfig.pinSalt,
          snapshot.securityConfig.pinHash
        );
        if (!ok) {
          throw new Error('Current PIN is incorrect.');
        }
      }
      const salt = generateSalt();
      const hash = await hashPin(newPin, salt);
      const nextConfig: SecurityConfig = {
        pinEnabled: true,
        pinHash: hash,
        pinSalt: salt,
        updatedAt: new Date().toISOString(),
      };
      await setSetting(
        'securityConfig',
        nextConfig,
        snapshot.securityConfig.pinEnabled ? 'Changed Administrator PIN.' : 'Enabled Administrator PIN lock.'
      );
      await refreshData();
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      notify('success', 'Administrator PIN saved securely (PBKDF2 hashed).');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save PIN.');
    } finally {
      setSavingPin(false);
    }
  };

  const handleDisablePin = async () => {
    if (!currentPin.trim()) {
      notify('error', 'Enter your current PIN to disable lock screen.');
      return;
    }
    setSavingPin(true);
    try {
      const ok = await verifyPinHash(
        currentPin,
        snapshot.securityConfig.pinSalt,
        snapshot.securityConfig.pinHash
      );
      if (!ok) throw new Error('Current PIN is incorrect.');
      await setSetting(
        'securityConfig',
        { ...DEFAULT_SECURITY_CONFIG, updatedAt: new Date().toISOString() },
        'Disabled Administrator PIN lock.'
      );
      await refreshData();
      setCurrentPin('');
      notify('success', 'Administrator PIN lock disabled.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to disable PIN.');
    } finally {
      setSavingPin(false);
    }
  };

  const handleExportBackup = async () => {
    setBusyBackup(true);
    try {
      const payload = await exportBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `medledger-backup-${formatDateDDMMYYYY(todayISO())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('success', 'Full JSON backup exported.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Backup export failed.');
    } finally {
      setBusyBackup(false);
    }
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      requestConfirm({
        title: 'Restore Database from Backup?',
        message: `Restoring "${file.name}" will replace all current local medicines, batches, sales, purchases, and ledgers with the validated backup contents.`,
        confirmLabel: 'Validate & Restore Backup',
        destructive: true,
        onConfirm: async () => {
          try {
            const res = await validateAndRestoreBackup(text);
            await refreshData();
            notify(
              'success',
              `Backup restored (${res.counts.medicines} medicines, ${res.counts.sales} sales).`
            );
          } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Backup restore failed.');
          }
        },
      });
    } catch {
      notify('error', 'Could not read the selected backup file.');
    }
  };

  const handleLoadSample = () => {
    requestConfirm({
      title: 'Load Sample Pharmacy Data?',
      message:
        'This will replace existing records with sample Pakistani pharmacy medicines, multi-batch stock, sales, and credit accounts for testing.',
      confirmLabel: 'Load Sample Data',
      onConfirm: async () => {
        await seedSamplePakistanPharmacyData();
        await refreshData();
        notify('success', 'Sample Pakistan pharmacy records loaded.');
      },
    });
  };

  const handleClearAll = () => {
    requestConfirm({
      title: 'Clear All Local Store Records?',
      message:
        'This permanently deletes all medicines, batches, sales, purchases, expenses, and customer/supplier ledgers from this browser. Export a JSON backup first!',
      confirmLabel: 'Delete Everything',
      destructive: true,
      onConfirm: async () => {
        await clearAllDatabaseRecords();
        await refreshData();
        notify('info', 'All local store records have been cleared.');
      },
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Backup & Offline Data Safety */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              Backup, Restore &amp; Offline Data Safety
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              All records are stored locally in your device&apos;s IndexedDB database with no internet required. There is no automatic cloud sync—if browser site data is cleared or a device is lost, local records can only be recovered from your exported JSON backup file.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={busyBackup}
              onClick={handleExportBackup}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
            >
              <Download className="w-4 h-4" />
              Export JSON Backup
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold"
            >
              <Upload className="w-4 h-4" />
              Restore from JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleSelectBackupFile}
              className="hidden"
            />
          </div>
        </div>

        <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <strong>Recommended Backup Habit:</strong> Export a JSON backup at the end of every week (or daily after closing the counter) and save it to a USB flash drive, Google Drive, or your own WhatsApp/email. Restored backups are automatically checked for structure and SHA-256 integrity before modifying local records.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Store Profile */}
        <form
          onSubmit={handleSaveProfile}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
        >
          <h2 className="text-base font-bold flex items-center gap-2">
            <Store className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            Store Profile (Printed on Invoices)
          </h2>
          <div>
            <label className="block text-xs font-medium mb-1">Medical Store Name *</label>
            <input
              required
              value={profile.storeName}
              onChange={(e) => setProfile({ ...profile, storeName: e.target.value })}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tagline</label>
            <input
              value={profile.tagline}
              onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Phone</label>
              <input
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Pharmacy License #</label>
              <input
                value={profile.licenseNumber}
                onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Store Address</label>
            <input
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
          >
            {savingProfile ? 'Saving...' : 'Save Store Profile'}
          </button>
        </form>

        {/* Local Admin PIN Security */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              Administrator PIN Lock
            </h2>
            {snapshot.securityConfig.pinEnabled && (
              <button
                type="button"
                onClick={lockApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock Now
              </button>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Status:{' '}
            <strong className={snapshot.securityConfig.pinEnabled ? 'text-emerald-600 dark:text-emerald-400' : ''}>
              {snapshot.securityConfig.pinEnabled ? 'PIN Lock Enabled' : 'Not Configured'}
            </strong>
            {' '}· PINs are hashed locally with PBKDF2-SHA256 + random salt (never stored in plain text).
          </p>

          <form onSubmit={handleSetOrChangePin} className="space-y-3">
            {snapshot.securityConfig.pinEnabled && (
              <div>
                <label className="block text-xs font-medium mb-1">Current PIN *</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  {snapshot.securityConfig.pinEnabled ? 'New PIN (4+ digits)' : 'Set PIN (4+ digits)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={12}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={12}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={savingPin}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                {snapshot.securityConfig.pinEnabled ? 'Update PIN' : 'Enable PIN Lock'}
              </button>
              {snapshot.securityConfig.pinEnabled && (
                <button
                  type="button"
                  disabled={savingPin}
                  onClick={handleDisablePin}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Disable PIN Lock
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Android PWA Install + Demo/Reset */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            Install on Android &amp; Offline Use
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Open this app in Google Chrome on Android and tap <strong>Install App</strong> (or Chrome menu → <strong>Add to Home screen / Install app</strong>). Once installed and opened once, the service worker caches the application shell so billing, stock lookups, and ledger entries continue working without internet.
          </p>
          <div className="pt-1">
            <PWAInstallButton />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            Medical Safety Disclaimer: This system is strictly for inventory, billing, and business record management. It does not provide medical diagnosis, prescriptions, dosage advice, or medicine substitution.
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
          <h2 className="text-base font-bold">Database Utilities</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Current local records: {snapshot.medicines.length} medicines · {snapshot.batches.length} batches ·{' '}
            {snapshot.sales.length} sales · {snapshot.customers.length} customers.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold"
            >
              <Database className="w-4 h-4" />
              Load Sample Pharmacy Data
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold"
            >
              <Trash2 className="w-4 h-4" />
              Clear All Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
