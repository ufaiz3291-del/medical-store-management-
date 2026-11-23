import React from 'react';
import { LayoutDashboard, ShoppingCart, Package, Menu } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

interface MobileBottomNavProps {
  onOpenMoreMenu: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenMoreMenu }) => {
  const { activeSection, setActiveSection } = useStore();

  const tabs = [
    { id: 'dashboard' as const, label: 'Home', icon: LayoutDashboard },
    { id: 'pos' as const, label: 'POS Sale', icon: ShoppingCart },
    { id: 'inventory' as const, label: 'Medicines', icon: Package },
  ];

  return (
    <nav
      className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center"
      aria-label="Mobile quick navigation"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeSection === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id)}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
              active
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOpenMoreMenu}
        className="h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"
      >
        <Menu className="w-5 h-5" />
        <span>More</span>
      </button>
    </nav>
  );
};
