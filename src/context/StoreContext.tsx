import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SECURITY_CONFIG,
  DEFAULT_STORE_PROFILE,
  FullSnapshot,
  loadFullSnapshot,
} from '../db/indexedDb';
import {
  AppSection,
  MedicineWithBatches,
  Sale,
  SecurityConfig,
  StoreProfile,
} from '../types';
import { isBatchExpired } from '../utils/format';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface StoreContextValue {
  snapshot: FullSnapshot;
  medicinesWithBatches: MedicineWithBatches[];
  loading: boolean;
  storageError: string | null;
  activeSection: AppSection;
  setActiveSection: (section: AppSection) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  isLocked: boolean;
  unlockApp: () => void;
  lockApp: () => void;
  refreshData: () => Promise<void>;
  toasts: ToastItem[];
  notify: (type: ToastItem['type'], message: string) => void;
  dismissToast: (id: string) => void;
  confirmState: ConfirmOptions | null;
  requestConfirm: (options: ConfirmOptions) => void;
  closeConfirm: () => void;
  activeInvoice: Sale | null;
  setActiveInvoice: (sale: Sale | null) => void;
}

const EMPTY_SNAPSHOT: FullSnapshot = {
  medicines: [],
  batches: [],
  sales: [],
  purchases: [],
  customers: [],
  customerTransactions: [],
  suppliers: [],
  supplierTransactions: [],
  expenses: [],
  inventoryTransactions: [],
  auditLogs: [],
  storeProfile: DEFAULT_STORE_PROFILE,
  securityConfig: DEFAULT_SECURITY_CONFIG,
};

const StoreContext = createContext<StoreContextValue | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<FullSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<Sale | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [initialLockChecked, setInitialLockChecked] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('medledger_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage access issues
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('medledger_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (type: ToastItem['type'], message: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 4200);
    },
    [dismissToast]
  );

  const refreshData = useCallback(async () => {
    try {
      const data = await loadFullSnapshot();
      setSnapshot(data);
      setStorageError(null);
      if (!initialLockChecked) {
        if (data.securityConfig.pinEnabled && data.securityConfig.pinHash) {
          setIsLocked(true);
        }
        setInitialLockChecked(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to read local IndexedDB storage.';
      setStorageError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [initialLockChecked, notify]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const medicinesWithBatches = useMemo<MedicineWithBatches[]>(() => {
    const batchMap = new Map<string, typeof snapshot.batches>();
    for (const batch of snapshot.batches) {
      const arr = batchMap.get(batch.medicineId) || [];
      arr.push(batch);
      batchMap.set(batch.medicineId, arr);
    }

    return snapshot.medicines
      .map((med) => {
        const medBatches = (batchMap.get(med.id) || []).sort((a, b) =>
          a.expiryDate.localeCompare(b.expiryDate)
        );
        let totalActiveStock = 0;
        let totalExpiredStock = 0;
        let earliestActiveExpiry: string | null = null;

        for (const b of medBatches) {
          if (isBatchExpired(b.expiryDate)) {
            totalExpiredStock += b.quantity;
          } else {
            totalActiveStock += b.quantity;
            if (b.quantity > 0 && (!earliestActiveExpiry || b.expiryDate < earliestActiveExpiry)) {
              earliestActiveExpiry = b.expiryDate;
            }
          }
        }

        return {
          ...med,
          batches: medBatches,
          totalActiveStock,
          totalExpiredStock,
          earliestActiveExpiry,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshot.medicines, snapshot.batches]);

  const unlockApp = useCallback(() => setIsLocked(false), []);
  const lockApp = useCallback(() => {
    if (snapshot.securityConfig.pinEnabled && snapshot.securityConfig.pinHash) {
      setIsLocked(true);
    }
  }, [snapshot.securityConfig]);

  const requestConfirm = useCallback((options: ConfirmOptions) => {
    setConfirmState(options);
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState(null);
  }, []);

  const value: StoreContextValue = {
    snapshot,
    medicinesWithBatches,
    loading,
    storageError,
    activeSection,
    setActiveSection,
    theme,
    toggleTheme,
    isLocked,
    unlockApp,
    lockApp,
    refreshData,
    toasts,
    notify,
    dismissToast,
    confirmState,
    requestConfirm,
    closeConfirm,
    activeInvoice,
    setActiveInvoice,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
