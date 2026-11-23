import React, { useState } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { Sidebar } from './components/Layout/Sidebar';
import { TopBar } from './components/Layout/TopBar';
import { MobileBottomNav } from './components/Layout/MobileBottomNav';
import { OfflineIndicator } from './components/Layout/OfflineIndicator';
import { ToastContainer } from './components/Common/ToastContainer';
import { ConfirmModal } from './components/Common/ConfirmModal';
import { PinLockScreen } from './components/Common/PinLockScreen';
import { InvoiceModal } from './components/Common/InvoiceModal';
import { DashboardView } from './components/Dashboard/DashboardView';
import { PosView } from './components/POS/PosView';
import { InventoryView } from './components/Inventory/InventoryView';
import { ExpiryView } from './components/Expiry/ExpiryView';
import { PurchasesView } from './components/Purchases/PurchasesView';
import { CustomersView } from './components/Customers/CustomersView';
import { SuppliersView } from './components/Suppliers/SuppliersView';
import { ExpensesView } from './components/Expenses/ExpensesView';
import { ReportsView } from './components/Reports/ReportsView';
import { HistoryView } from './components/History/HistoryView';
import { SettingsView } from './components/Settings/SettingsView';

const AppWorkspace: React.FC = () => {
  const { activeSection, isLocked, storageError, activeInvoice } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLocked) {
    return (
      <>
        <PinLockScreen />
        <ToastContainer />
      </>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardView />;
      case 'pos':
        return <PosView />;
      case 'inventory':
        return <InventoryView />;
      case 'expiry':
        return <ExpiryView />;
      case 'purchases':
        return <PurchasesView />;
      case 'customers':
        return <CustomersView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'expenses':
        return <ExpensesView />;
      case 'reports':
        return <ReportsView />;
      case 'history':
        return <HistoryView />;
      case 'settings':
        return <SettingsView />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      <div className={`flex-1 flex flex-col min-w-0 ${activeInvoice ? 'no-print' : ''}`}>
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {storageError && (
            <div className="no-print mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 p-4 text-sm text-red-800 dark:text-red-200">
              <strong>Storage Error:</strong> {storageError}
            </div>
          )}
          {renderSection()}
        </main>
      </div>

      <MobileBottomNav onOpenMoreMenu={() => setMobileMenuOpen(true)} />
      <OfflineIndicator />
      <ToastContainer />
      <ConfirmModal />
      <InvoiceModal />
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <AppWorkspace />
    </StoreProvider>
  );
}
