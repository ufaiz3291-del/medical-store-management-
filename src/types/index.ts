export type AppSection =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'expiry'
  | 'purchases'
  | 'customers'
  | 'suppliers'
  | 'expenses'
  | 'reports'
  | 'history'
  | 'settings';

export type PaymentMethod = 'Cash' | 'EasyPaisa/JazzCash' | 'Card/Bank' | 'Credit';

export type MedicineCategory =
  | 'Tablets'
  | 'Capsules'
  | 'Syrups'
  | 'Injections'
  | 'Drops'
  | 'Ointments & Creams'
  | 'Inhalers'
  | 'Surgical & Supplies'
  | 'Other';

export const MEDICINE_CATEGORIES: MedicineCategory[] = [
  'Tablets',
  'Capsules',
  'Syrups',
  'Injections',
  'Drops',
  'Ointments & Creams',
  'Inhalers',
  'Surgical & Supplies',
  'Other',
];

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  brand: string;
  category: MedicineCategory;
  barcode: string;
  minStockLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineBatch {
  id: string;
  medicineId: string;
  batchNumber: string;
  manufacturingDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  purchasePrice: number; // PKR per unit
  sellingPrice: number; // PKR per unit
  quantity: number;
  initialQuantity: number;
  supplierId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineWithBatches extends Medicine {
  batches: MedicineBatch[];
  totalActiveStock: number;
  totalExpiredStock: number;
  earliestActiveExpiry: string | null;
}

export interface SaleItem {
  medicineId: string;
  medicineName: string;
  genericName: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitPurchasePrice: number; // Exact batch cost for accurate profit reporting
  unitSellingPrice: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
  customerId?: string;
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  amountPaid: number;
  remainingBalance: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface PurchaseItem {
  medicineId: string;
  medicineName: string;
  batchId: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  supplierInvoiceNumber: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  totalAmount: number;
  amountPaid: number;
  remainingBalance: number;
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid';
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  totalCreditBalance: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTransaction {
  id: string;
  customerId: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  type: 'Sale Credit' | 'Payment Received' | 'Adjustment';
  amount: number;
  balanceAfter: number;
  referenceNumber: string;
  paymentMethod?: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  address?: string;
  totalPayableBalance: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  type: 'Purchase' | 'Payment Made' | 'Adjustment';
  amount: number;
  balanceAfter: number;
  referenceNumber: string;
  paymentMethod?: string;
  notes?: string;
}

export type ExpenseCategory =
  | 'Electricity'
  | 'Shop Rent'
  | 'Employee Salaries'
  | 'Maintenance'
  | 'Transport'
  | 'Other';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Electricity',
  'Shop Rent',
  'Employee Salaries',
  'Maintenance',
  'Transport',
  'Other',
];

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  title: string;
  amount: number;
  paymentMethod: 'Cash' | 'Bank/Digital';
  notes?: string;
  createdAt: string;
}

export type InventoryTransactionType =
  | 'Initial Stock'
  | 'Purchase'
  | 'Sale'
  | 'Return'
  | 'Damaged'
  | 'Expired Adjustment'
  | 'Manual Correction';

export interface InventoryTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  medicineId: string;
  medicineName: string;
  batchId?: string;
  batchNumber?: string;
  type: InventoryTransactionType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  referenceNumber: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}

export interface StoreProfile {
  storeName: string;
  tagline: string;
  phone: string;
  address: string;
  licenseNumber: string;
}

export interface SecurityConfig {
  pinEnabled: boolean;
  pinHash: string;
  pinSalt: string;
  updatedAt: string;
}

export interface BackupPayload {
  app: 'MedLedgerPK';
  schemaVersion: number;
  exportedAt: string;
  checksum: string;
  data: {
    medicines: Medicine[];
    batches: MedicineBatch[];
    sales: Sale[];
    purchases: Purchase[];
    customers: Customer[];
    customerTransactions: CustomerTransaction[];
    suppliers: Supplier[];
    supplierTransactions: SupplierTransaction[];
    expenses: Expense[];
    inventoryTransactions: InventoryTransaction[];
    auditLogs: AuditLog[];
    storeProfile?: StoreProfile;
  };
}
