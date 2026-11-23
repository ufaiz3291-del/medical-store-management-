import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ClockAlert,
  Truck,
  Users,
  Building2,
  Receipt,
  BarChart3,
  History,
  Settings,
  X,
  Cross,
} from 'lucide-react';
import { AppSection } from '../../types';
import { useStore } from '../../context/StoreContext';
import { getExpiryBucket } from '../../utils/format';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavGroup {
  label: string;
  items: Array<{
    id: AppSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeCount?: number;
    badgeTone?: 'danger' | 'warn';
  }>;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { activeSection, setActiveSection, snapshot, medicinesWithBatches } = useStore();

  const expiredBatchesCount = snapshot.batches.filter(
    (b) => b.quantity > 0 && getExpiryBucket(b.expiryDate) === 'expired'
  ).length;

  const lowStockCount = medicinesWithBatches.filter(
    (m) => m.totalActiveStock <= m.minStockLevel
  ).length;

  const navGroups: NavGroup[] = [
    {
      label: 'Daily Operations',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'pos', label: 'POS & Billing', icon: ShoppingCart },
        {
          id: 'inventory',
          label: 'Medicines',
          icon: Package,
          badgeCount: lowStockCount > 0 ? lowStockCount : undefined,
          badgeTone: 'warn',
        },
        {
          id: 'expiry',
          label: 'Expiry Tracker',
          icon: ClockAlert,
          badgeCount: expiredBatchesCount > 0 ? expiredBatchesCount : undefined,
          badgeTone: 'danger',
        },
        { id: 'purchases', label: 'Purchases', icon: Truck },
      ],
    },
    {
      label: 'Accounts & Finance',
      items: [
        { id: 'customers', label: 'Customer Credit', icon: Users },
        { id: 'suppliers', label: 'Suppliers', icon: Building2 },
        { id: 'expenses', label: 'Expenses', icon: Receipt },
        { id: 'reports', label: 'Reports & CSV', icon: BarChart3 },
      ],
    },
    {
      label: 'System & Safety',
      items: [
        { id: 'history', label: 'Stock History', icon: History },
        { id: 'settings', label: 'Backup & Settings', icon: Settings },
      ],
    },
  ];

  const handleSelect = (id: AppSection) => {
    setActiveSection(id);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
            <Cross className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {snapshot.storeProfile.storeName}
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Main navigation">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700 dark:text-teal-400' : ''}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badgeCount !== undefined && (
                      <span
                        className={`text-xs font-mono-num font-semibold tabular-nums ${
                          item.badgeTone === 'danger'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {item.badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
        <p className="font-medium text-slate-700 dark:text-slate-300">Offline Local Storage</p>
        <p className="mt-0.5">IndexedDB active · PKR · DD-MM-YYYY</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{navContent}</div>
        </div>
      )}
    </>
  );
};
