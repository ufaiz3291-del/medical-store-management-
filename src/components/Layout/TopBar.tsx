import React from 'react';
import { Lock, Menu, Moon, Plus, Sun } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { AppSection } from '../../types';
import { PWAInstallButton } from './PWAInstallButton';

const SECTION_TITLES: Record<AppSection, string> = {
  dashboard: 'Store Dashboard',
  pos: 'Point of Sale & Billing',
  inventory: 'Medicine Inventory',
  expiry: 'Expiry Management',
  purchases: 'Supplier Purchases',
  customers: 'Customer Credit Ledger',
  suppliers: 'Supplier Accounts',
  expenses: 'Business Expenses',
  reports: 'Reports & Analytics',
  history: 'Inventory & Audit History',
  settings: 'Backup, Security & Settings',
};

interface TopBarProps {
  onOpenMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenMobileMenu }) => {
  const { activeSection, setActiveSection, theme, toggleTheme, snapshot, lockApp } = useStore();

  return (
    <header className="no-print sticky top-0 z-30 h-14 lg:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base lg:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
          {SECTION_TITLES[activeSection]}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <PWAInstallButton compact />

        {snapshot.securityConfig.pinEnabled && (
          <button
            type="button"
            onClick={lockApp}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Lock Store System"
            aria-label="Lock Store System"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        {activeSection !== 'pos' && (
          <button
            type="button"
            onClick={() => setActiveSection('pos')}
            className="hidden sm:inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Sale
          </button>
        )}
      </div>
    </header>
  );
};
