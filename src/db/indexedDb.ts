import {
  AuditLog,
  BackupPayload,
  Customer,
  CustomerTransaction,
  Expense,
  InventoryTransaction,
  InventoryTransactionType,
  Medicine,
  MedicineBatch,
  PaymentMethod,
  Purchase,
  Sale,
  SaleItem,
  SecurityConfig,
  StoreProfile,
  Supplier,
  SupplierTransaction,
} from '../types';
import { computeSha256 } from '../utils/crypto';
import { addDaysISO, generateId, isBatchExpired, todayISO } from '../utils/format';

const DB_NAME = 'medledger_pk_db';
const DB_VERSION = 1;

export const STORE_NAMES = [
  'medicines',
  'batches',
  'sales',
  'purchases',
  'customers',
  'customerTransactions',
  'suppliers',
  'supplierTransactions',
  'expenses',
  'inventoryTransactions',
  'auditLogs',
  'settings',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export const DEFAULT_STORE_PROFILE: StoreProfile = {
  storeName: 'Al-Shifa Medical Store',
  tagline: 'Licensed Pharmacy & Healthcare Supplies',
  phone: '0300-0000000',
  address: 'Main Bazaar, Lahore, Pakistan',
  licenseNumber: 'DRAP-LHR-0000',
};

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  pinEnabled: false,
  pinHash: '',
  pinSalt: '',
  updatedAt: new Date().toISOString(),
};

let dbInstancePromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbInstancePromise) return dbInstancePromise;

  dbInstancePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('medicines')) {
        const medStore = db.createObjectStore('medicines', { keyPath: 'id' });
        medStore.createIndex('name', 'name', { unique: false });
        medStore.createIndex('barcode', 'barcode', { unique: false });
        medStore.createIndex('category', 'category', { unique: false });
        medStore.createIndex('brand', 'brand', { unique: false });
      }

      if (!db.objectStoreNames.contains('batches')) {
        const batchStore = db.createObjectStore('batches', { keyPath: 'id' });
        batchStore.createIndex('medicineId', 'medicineId', { unique: false });
        batchStore.createIndex('expiryDate', 'expiryDate', { unique: false });
        batchStore.createIndex('batchNumber', 'batchNumber', { unique: false });
      }

      if (!db.objectStoreNames.contains('sales')) {
        const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
        salesStore.createIndex('date', 'date', { unique: false });
        salesStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
      }

      if (!db.objectStoreNames.contains('purchases')) {
        const purchaseStore = db.createObjectStore('purchases', { keyPath: 'id' });
        purchaseStore.createIndex('date', 'date', { unique: false });
        purchaseStore.createIndex('supplierId', 'supplierId', { unique: false });
      }

      if (!db.objectStoreNames.contains('customers')) {
        const custStore = db.createObjectStore('customers', { keyPath: 'id' });
        custStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains('customerTransactions')) {
        const ctStore = db.createObjectStore('customerTransactions', { keyPath: 'id' });
        ctStore.createIndex('customerId', 'customerId', { unique: false });
        ctStore.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('suppliers')) {
        const supStore = db.createObjectStore('suppliers', { keyPath: 'id' });
        supStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains('supplierTransactions')) {
        const stStore = db.createObjectStore('supplierTransactions', { keyPath: 'id' });
        stStore.createIndex('supplierId', 'supplierId', { unique: false });
        stStore.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('expenses')) {
        const expStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expStore.createIndex('date', 'date', { unique: false });
        expStore.createIndex('category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains('inventoryTransactions')) {
        const invTxStore = db.createObjectStore('inventoryTransactions', { keyPath: 'id' });
        invTxStore.createIndex('medicineId', 'medicineId', { unique: false });
        invTxStore.createIndex('date', 'date', { unique: false });
        invTxStore.createIndex('type', 'type', { unique: false });
      }

      if (!db.objectStoreNames.contains('auditLogs')) {
        const auditStore = db.createObjectStore('auditLogs', { keyPath: 'id' });
        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbInstancePromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbInstancePromise = null;
      reject(request.error || new Error('Failed to open local IndexedDB database.'));
    };
  });

  return dbInstancePromise;
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction was aborted.'));
  });
}

export async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return reqToPromise<T[]>(store.getAll());
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  const tx = db.transaction('settings', 'readonly');
  const store = tx.objectStore('settings');
  const record = await reqToPromise<{ key: string; value: T } | undefined>(store.get(key));
  return record ? record.value : null;
}

export async function setSetting<T>(key: string, value: T, auditSummary?: string): Promise<void> {
  const db = await openDatabase();
  const stores: StoreName[] = auditSummary ? ['settings', 'auditLogs'] : ['settings'];
  const tx = db.transaction(stores, 'readwrite');
  tx.objectStore('settings').put({ key, value });
  if (auditSummary) {
    const audit: AuditLog = {
      id: generateId('aud'),
      timestamp: new Date().toISOString(),
      action: 'SETTINGS_UPDATED',
      entityType: 'settings',
      entityId: key,
      summary: auditSummary,
    };
    tx.objectStore('auditLogs').put(audit);
  }
  await txDone(tx);
}

export interface FullSnapshot {
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
  storeProfile: StoreProfile;
  securityConfig: SecurityConfig;
}

export async function loadFullSnapshot(): Promise<FullSnapshot> {
  const db = await openDatabase();
  const tx = db.transaction([...STORE_NAMES], 'readonly');

  const [
    medicines,
    batches,
    sales,
    purchases,
    customers,
    customerTransactions,
    suppliers,
    supplierTransactions,
    expenses,
    inventoryTransactions,
    auditLogs,
    settingsList,
  ] = await Promise.all([
    reqToPromise<Medicine[]>(tx.objectStore('medicines').getAll()),
    reqToPromise<MedicineBatch[]>(tx.objectStore('batches').getAll()),
    reqToPromise<Sale[]>(tx.objectStore('sales').getAll()),
    reqToPromise<Purchase[]>(tx.objectStore('purchases').getAll()),
    reqToPromise<Customer[]>(tx.objectStore('customers').getAll()),
    reqToPromise<CustomerTransaction[]>(tx.objectStore('customerTransactions').getAll()),
    reqToPromise<Supplier[]>(tx.objectStore('suppliers').getAll()),
    reqToPromise<SupplierTransaction[]>(tx.objectStore('supplierTransactions').getAll()),
    reqToPromise<Expense[]>(tx.objectStore('expenses').getAll()),
    reqToPromise<InventoryTransaction[]>(tx.objectStore('inventoryTransactions').getAll()),
    reqToPromise<AuditLog[]>(tx.objectStore('auditLogs').getAll()),
    reqToPromise<Array<{ key: string; value: unknown }>>(tx.objectStore('settings').getAll()),
  ]);

  const settingsMap = new Map(settingsList.map((s) => [s.key, s.value]));

  return {
    medicines,
    batches,
    sales: sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    purchases: purchases.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    customers: customers.sort((a, b) => a.name.localeCompare(b.name)),
    customerTransactions: customerTransactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    suppliers: suppliers.sort((a, b) => a.name.localeCompare(b.name)),
    supplierTransactions: supplierTransactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    expenses: expenses.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    inventoryTransactions: inventoryTransactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    auditLogs: auditLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    storeProfile: (settingsMap.get('storeProfile') as StoreProfile) || DEFAULT_STORE_PROFILE,
    securityConfig: (settingsMap.get('securityConfig') as SecurityConfig) || DEFAULT_SECURITY_CONFIG,
  };
}

export async function addMedicineWithBatch(input: {
  medicine: Omit<Medicine, 'id' | 'createdAt' | 'updatedAt'>;
  initialBatch?: {
    batchNumber: string;
    manufacturingDate: string;
    expiryDate: string;
    purchasePrice: number;
    sellingPrice: number;
    quantity: number;
  };
}): Promise<{ medicine: Medicine; batch?: MedicineBatch }> {
  if (!input.medicine.name.trim()) throw new Error('Medicine name is required.');
  if (input.medicine.minStockLevel < 0) throw new Error('Minimum stock level cannot be negative.');

  const now = new Date().toISOString();
  const med: Medicine = {
    ...input.medicine,
    name: input.medicine.name.trim(),
    genericName: input.medicine.genericName.trim(),
    brand: input.medicine.brand.trim(),
    barcode: input.medicine.barcode.trim(),
    id: generateId('med'),
    createdAt: now,
    updatedAt: now,
  };

  let batch: MedicineBatch | undefined;
  if (input.initialBatch) {
    const b = input.initialBatch;
    if (!b.batchNumber.trim()) throw new Error('Batch number is required.');
    if (!b.expiryDate) throw new Error('Expiry date is required.');
    if (b.purchasePrice < 0 || b.sellingPrice < 0) throw new Error('Prices cannot be negative.');
    if (b.quantity < 0) throw new Error('Quantity cannot be negative.');

    batch = {
      id: generateId('bat'),
      medicineId: med.id,
      batchNumber: b.batchNumber.trim(),
      manufacturingDate: b.manufacturingDate || todayISO(),
      expiryDate: b.expiryDate,
      purchasePrice: Number(b.purchasePrice),
      sellingPrice: Number(b.sellingPrice),
      quantity: Number(b.quantity),
      initialQuantity: Number(b.quantity),
      createdAt: now,
      updatedAt: now,
    };
  }

  const db = await openDatabase();
  const tx = db.transaction(['medicines', 'batches', 'inventoryTransactions', 'auditLogs'], 'readwrite');
  tx.objectStore('medicines').put(med);

  if (batch) {
    tx.objectStore('batches').put(batch);
    if (batch.quantity > 0) {
      const invTx: InventoryTransaction = {
        id: generateId('invtx'),
        date: todayISO(),
        createdAt: now,
        medicineId: med.id,
        medicineName: med.name,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        type: 'Initial Stock',
        quantityChange: batch.quantity,
        quantityBefore: 0,
        quantityAfter: batch.quantity,
        reason: 'Initial stock added with new medicine',
        referenceNumber: batch.batchNumber,
      };
      tx.objectStore('inventoryTransactions').put(invTx);
    }
  }

  const audit: AuditLog = {
    id: generateId('aud'),
    timestamp: now,
    action: 'MEDICINE_CREATED',
    entityType: 'medicine',
    entityId: med.id,
    summary: `Added medicine "${med.name}" (${med.brand || 'Generic'})${batch ? ` with batch ${batch.batchNumber} (${batch.quantity} units)` : ''}.`,
  };
  tx.objectStore('auditLogs').put(audit);

  await txDone(tx);
  return { medicine: med, batch };
}

export async function updateMedicineInfo(medicine: Medicine): Promise<void> {
  if (!medicine.name.trim()) throw new Error('Medicine name cannot be empty.');
  if (medicine.minStockLevel < 0) throw new Error('Minimum stock level cannot be negative.');

  const now = new Date().toISOString();
  const updated: Medicine = {
    ...medicine,
    name: medicine.name.trim(),
    genericName: medicine.genericName.trim(),
    brand: medicine.brand.trim(),
    barcode: medicine.barcode.trim(),
    updatedAt: now,
  };

  const db = await openDatabase();
  const tx = db.transaction(['medicines', 'auditLogs'], 'readwrite');
  tx.objectStore('medicines').put(updated);
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'MEDICINE_UPDATED',
    entityType: 'medicine',
    entityId: updated.id,
    summary: `Updated details for "${updated.name}".`,
  } satisfies AuditLog);
  await txDone(tx);
}

export async function addBatchToExistingMedicine(input: {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  reason?: string;
}): Promise<MedicineBatch> {
  if (!input.batchNumber.trim()) throw new Error('Batch number is required.');
  if (!input.expiryDate) throw new Error('Expiry date is required.');
  if (input.quantity < 0) throw new Error('Quantity cannot be negative.');
  if (input.purchasePrice < 0 || input.sellingPrice < 0) throw new Error('Prices cannot be negative.');

  const now = new Date().toISOString();
  const batch: MedicineBatch = {
    id: generateId('bat'),
    medicineId: input.medicineId,
    batchNumber: input.batchNumber.trim(),
    manufacturingDate: input.manufacturingDate || todayISO(),
    expiryDate: input.expiryDate,
    purchasePrice: Number(input.purchasePrice),
    sellingPrice: Number(input.sellingPrice),
    quantity: Number(input.quantity),
    initialQuantity: Number(input.quantity),
    createdAt: now,
    updatedAt: now,
  };

  const db = await openDatabase();
  const tx = db.transaction(['batches', 'inventoryTransactions', 'auditLogs'], 'readwrite');
  tx.objectStore('batches').put(batch);

  if (batch.quantity > 0) {
    tx.objectStore('inventoryTransactions').put({
      id: generateId('invtx'),
      date: todayISO(),
      createdAt: now,
      medicineId: input.medicineId,
      medicineName: input.medicineName,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      type: 'Initial Stock',
      quantityChange: batch.quantity,
      quantityBefore: 0,
      quantityAfter: batch.quantity,
      reason: input.reason || 'New batch added manually',
      referenceNumber: batch.batchNumber,
    } satisfies InventoryTransaction);
  }

  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'BATCH_ADDED',
    entityType: 'batch',
    entityId: batch.id,
    summary: `Added batch ${batch.batchNumber} (${batch.quantity} units) to "${input.medicineName}".`,
  } satisfies AuditLog);

  await txDone(tx);
  return batch;
}

export async function updateBatchMetadata(
  batch: MedicineBatch,
  medicineName: string
): Promise<void> {
  if (!batch.batchNumber.trim()) throw new Error('Batch number is required.');
  if (!batch.expiryDate) throw new Error('Expiry date is required.');
  if (batch.purchasePrice < 0 || batch.sellingPrice < 0) throw new Error('Prices cannot be negative.');

  const now = new Date().toISOString();
  const db = await openDatabase();
  const tx = db.transaction(['batches', 'auditLogs'], 'readwrite');
  const existing = await reqToPromise<MedicineBatch | undefined>(tx.objectStore('batches').get(batch.id));
  if (!existing) throw new Error('Batch not found.');

  // Preserve current quantity; quantity adjustments must go through recordStockAdjustment
  const updated: MedicineBatch = {
    ...existing,
    batchNumber: batch.batchNumber.trim(),
    manufacturingDate: batch.manufacturingDate,
    expiryDate: batch.expiryDate,
    purchasePrice: Number(batch.purchasePrice),
    sellingPrice: Number(batch.sellingPrice),
    updatedAt: now,
  };
  tx.objectStore('batches').put(updated);
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'BATCH_UPDATED',
    entityType: 'batch',
    entityId: updated.id,
    summary: `Updated batch ${updated.batchNumber} pricing/dates for "${medicineName}".`,
  } satisfies AuditLog);
  await txDone(tx);
}

export async function recordStockAdjustment(input: {
  batchId: string;
  medicineName: string;
  type: Extract<InventoryTransactionType, 'Return' | 'Damaged' | 'Expired Adjustment' | 'Manual Correction'>;
  quantityDelta: number; // positive to add, negative to deduct
  reason: string;
  referenceNumber?: string;
}): Promise<void> {
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) {
    throw new Error('Quantity adjustment must be a non-zero whole number.');
  }
  if (!input.reason.trim()) {
    throw new Error('Please enter a reason for this stock adjustment.');
  }

  const now = new Date().toISOString();
  const db = await openDatabase();
  const tx = db.transaction(['batches', 'inventoryTransactions', 'auditLogs'], 'readwrite');
  const batchStore = tx.objectStore('batches');
  const batch = await reqToPromise<MedicineBatch | undefined>(batchStore.get(input.batchId));
  if (!batch) throw new Error('Selected batch could not be found.');

  const newQty = batch.quantity + input.quantityDelta;
  if (newQty < 0) {
    throw new Error(`Cannot reduce stock below 0. Available in batch: ${batch.quantity}.`);
  }

  const updatedBatch: MedicineBatch = {
    ...batch,
    quantity: newQty,
    updatedAt: now,
  };
  batchStore.put(updatedBatch);

  const invTx: InventoryTransaction = {
    id: generateId('invtx'),
    date: todayISO(),
    createdAt: now,
    medicineId: batch.medicineId,
    medicineName: input.medicineName,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    type: input.type,
    quantityChange: input.quantityDelta,
    quantityBefore: batch.quantity,
    quantityAfter: newQty,
    reason: input.reason.trim(),
    referenceNumber: input.referenceNumber?.trim() || `ADJ-${Date.now().toString().slice(-6)}`,
  };
  tx.objectStore('inventoryTransactions').put(invTx);

  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'STOCK_ADJUSTMENT',
    entityType: 'batch',
    entityId: batch.id,
    summary: `${input.type} on "${input.medicineName}" (${batch.batchNumber}): ${input.quantityDelta > 0 ? '+' : ''}${input.quantityDelta} units (${batch.quantity} -> ${newQty}). Reason: ${input.reason.trim()}`,
  } satisfies AuditLog);

  await txDone(tx);
}

export async function deleteMedicineSafely(medicineId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['medicines', 'batches', 'auditLogs'], 'readwrite');
  const med = await reqToPromise<Medicine | undefined>(tx.objectStore('medicines').get(medicineId));
  if (!med) throw new Error('Medicine not found.');

  const allBatches = await reqToPromise<MedicineBatch[]>(tx.objectStore('batches').getAll());
  const medBatches = allBatches.filter((b) => b.medicineId === medicineId);
  const activeQty = medBatches.reduce((sum, b) => sum + b.quantity, 0);
  if (activeQty > 0) {
    throw new Error(`Cannot delete "${med.name}" while ${activeQty} units remain in stock. Adjust stock to 0 first.`);
  }

  tx.objectStore('medicines').delete(medicineId);
  for (const b of medBatches) {
    tx.objectStore('batches').delete(b.id);
  }
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: new Date().toISOString(),
    action: 'MEDICINE_DELETED',
    entityType: 'medicine',
    entityId: medicineId,
    summary: `Deleted medicine "${med.name}" (0 stock remaining).`,
  } satisfies AuditLog);

  await txDone(tx);
}

export async function completeSaleTransaction(input: {
  items: Array<{
    medicineId: string;
    medicineName: string;
    genericName: string;
    batchId: string;
    quantity: number;
    unitSellingPrice: number;
  }>;
  discount: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerName?: string;
  notes?: string;
}): Promise<Sale> {
  if (input.items.length === 0) throw new Error('Add at least one medicine to complete the sale.');
  if (input.discount < 0) throw new Error('Discount cannot be negative.');
  if (input.amountPaid < 0) throw new Error('Amount paid cannot be negative.');

  // Consolidate duplicate batch lines to prevent overselling
  const qtyByBatch = new Map<string, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity for ${item.medicineName}.`);
    }
    if (item.unitSellingPrice < 0) {
      throw new Error(`Invalid price for ${item.medicineName}.`);
    }
    qtyByBatch.set(item.batchId, (qtyByBatch.get(item.batchId) || 0) + item.quantity);
  }

  const db = await openDatabase();
  const tx = db.transaction(
    ['batches', 'sales', 'inventoryTransactions', 'customers', 'customerTransactions', 'settings', 'auditLogs'],
    'readwrite'
  );

  const batchStore = tx.objectStore('batches');
  const batchMap = new Map<string, MedicineBatch>();
  for (const batchId of qtyByBatch.keys()) {
    const batch = await reqToPromise<MedicineBatch | undefined>(batchStore.get(batchId));
    if (!batch) throw new Error('One of the selected medicine batches no longer exists.');
    if (isBatchExpired(batch.expiryDate)) {
      throw new Error(`Sale blocked: Batch ${batch.batchNumber} expired on ${batch.expiryDate} and cannot be sold.`);
    }
    const requestedQty = qtyByBatch.get(batchId) || 0;
    if (batch.quantity < requestedQty) {
      throw new Error(`Insufficient stock for batch ${batch.batchNumber}. Available: ${batch.quantity}, Requested: ${requestedQty}.`);
    }
    batchMap.set(batchId, batch);
  }

  const counterSetting = await reqToPromise<{ key: string; value: number } | undefined>(
    tx.objectStore('settings').get('invoiceCounter')
  );
  const nextCounter = (counterSetting?.value ?? 1000) + 1;
  const invoiceNumber = `INV-${String(nextCounter).padStart(5, '0')}`;

  const saleItems: SaleItem[] = input.items.map((item) => {
    const batch = batchMap.get(item.batchId)!;
    const subtotal = Math.round(item.quantity * item.unitSellingPrice * 100) / 100;
    return {
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      genericName: item.genericName,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity: item.quantity,
      unitPurchasePrice: batch.purchasePrice,
      unitSellingPrice: item.unitSellingPrice,
      subtotal,
    };
  });

  const subtotal = Math.round(saleItems.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  const discount = Math.min(subtotal, Math.round(input.discount * 100) / 100);
  const totalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const amountPaid = Math.min(totalAmount, Math.round(input.amountPaid * 100) / 100);
  const remainingBalance = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);

  if (remainingBalance > 0 && !input.customerId) {
    throw new Error('Please select or add a customer when recording a credit / partial-payment sale.');
  }

  let resolvedCustomerName = input.customerName?.trim() || 'Walk-in Customer';
  if (input.customerId) {
    const customer = await reqToPromise<Customer | undefined>(tx.objectStore('customers').get(input.customerId));
    if (!customer) throw new Error('Selected customer record was not found.');
    resolvedCustomerName = customer.name;
    if (remainingBalance > 0) {
      const updatedCustomer: Customer = {
        ...customer,
        totalCreditBalance: Math.round((customer.totalCreditBalance + remainingBalance) * 100) / 100,
        updatedAt: new Date().toISOString(),
      };
      tx.objectStore('customers').put(updatedCustomer);

      const ct: CustomerTransaction = {
        id: generateId('ct'),
        customerId: customer.id,
        customerName: customer.name,
        date: todayISO(),
        createdAt: new Date().toISOString(),
        type: 'Sale Credit',
        amount: remainingBalance,
        balanceAfter: updatedCustomer.totalCreditBalance,
        referenceNumber: invoiceNumber,
        paymentMethod: input.paymentMethod,
        notes: `Credit balance from invoice ${invoiceNumber}`,
      };
      tx.objectStore('customerTransactions').put(ct);
    }
  }

  const now = new Date().toISOString();
  const saleDate = todayISO();

  // Deduct each batch once using consolidated quantities and log each sale line
  const runningBefore = new Map<string, number>();
  for (const [bId, batch] of batchMap.entries()) {
    runningBefore.set(bId, batch.quantity);
    batchStore.put({
      ...batch,
      quantity: batch.quantity - (qtyByBatch.get(bId) || 0),
      updatedAt: now,
    });
  }

  for (const item of saleItems) {
    const before = runningBefore.get(item.batchId) || 0;
    const after = before - item.quantity;
    runningBefore.set(item.batchId, after);
    tx.objectStore('inventoryTransactions').put({
      id: generateId('invtx'),
      date: saleDate,
      createdAt: now,
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      batchId: item.batchId,
      batchNumber: item.batchNumber,
      type: 'Sale',
      quantityChange: -item.quantity,
      quantityBefore: before,
      quantityAfter: after,
      reason: `Sold on invoice ${invoiceNumber}`,
      referenceNumber: invoiceNumber,
    } satisfies InventoryTransaction);
  }

  const sale: Sale = {
    id: generateId('sale'),
    invoiceNumber,
    date: saleDate,
    createdAt: now,
    customerId: input.customerId,
    customerName: resolvedCustomerName,
    items: saleItems,
    subtotal,
    discount,
    totalAmount,
    amountPaid,
    remainingBalance,
    paymentMethod: input.paymentMethod,
    notes: input.notes?.trim(),
  };

  tx.objectStore('sales').put(sale);
  tx.objectStore('settings').put({ key: 'invoiceCounter', value: nextCounter });

  await txDone(tx);
  return sale;
}

export async function completePurchaseTransaction(input: {
  supplierId: string;
  supplierInvoiceNumber: string;
  date: string;
  amountPaid: number;
  notes?: string;
  items: Array<{
    medicineId: string;
    medicineName: string;
    batchNumber: string;
    manufacturingDate: string;
    expiryDate: string;
    quantity: number;
    purchasePrice: number;
    sellingPrice: number;
  }>;
}): Promise<Purchase> {
  if (!input.supplierId) throw new Error('Please select a supplier.');
  if (!input.supplierInvoiceNumber.trim()) throw new Error('Supplier invoice number is required.');
  if (input.items.length === 0) throw new Error('Add at least one medicine item to the purchase.');
  if (input.amountPaid < 0) throw new Error('Amount paid cannot be negative.');

  for (const item of input.items) {
    if (!item.batchNumber.trim()) throw new Error(`Batch number is required for ${item.medicineName}.`);
    if (!item.expiryDate) throw new Error(`Expiry date is required for ${item.medicineName}.`);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Quantity must be a positive whole number for ${item.medicineName}.`);
    }
    if (item.purchasePrice < 0 || item.sellingPrice < 0) {
      throw new Error(`Prices cannot be negative for ${item.medicineName}.`);
    }
  }

  const db = await openDatabase();
  const tx = db.transaction(
    ['suppliers', 'supplierTransactions', 'batches', 'purchases', 'inventoryTransactions', 'auditLogs'],
    'readwrite'
  );

  const supplier = await reqToPromise<Supplier | undefined>(tx.objectStore('suppliers').get(input.supplierId));
  if (!supplier) throw new Error('Selected supplier not found.');

  const allBatches = await reqToPromise<MedicineBatch[]>(tx.objectStore('batches').getAll());
  const batchStore = tx.objectStore('batches');
  const now = new Date().toISOString();
  const purchaseDate = input.date || todayISO();

  const purchaseItems = [];
  for (const item of input.items) {
    const trimmedBatch = item.batchNumber.trim();
    const existingBatch = allBatches.find(
      (b) =>
        b.medicineId === item.medicineId &&
        b.batchNumber.toLowerCase() === trimmedBatch.toLowerCase() &&
        b.expiryDate === item.expiryDate
    );

    let batchId: string;
    let qtyBefore = 0;
    let qtyAfter = item.quantity;

    if (existingBatch) {
      batchId = existingBatch.id;
      qtyBefore = existingBatch.quantity;
      qtyAfter = existingBatch.quantity + item.quantity;
      const updatedBatch: MedicineBatch = {
        ...existingBatch,
        quantity: qtyAfter,
        initialQuantity: existingBatch.initialQuantity + item.quantity,
        purchasePrice: Number(item.purchasePrice),
        sellingPrice: Number(item.sellingPrice),
        supplierId: supplier.id,
        updatedAt: now,
      };
      batchStore.put(updatedBatch);
      // update local list so duplicate lines in same purchase accumulate properly
      existingBatch.quantity = qtyAfter;
    } else {
      batchId = generateId('bat');
      const newBatch: MedicineBatch = {
        id: batchId,
        medicineId: item.medicineId,
        batchNumber: trimmedBatch,
        manufacturingDate: item.manufacturingDate || purchaseDate,
        expiryDate: item.expiryDate,
        purchasePrice: Number(item.purchasePrice),
        sellingPrice: Number(item.sellingPrice),
        quantity: item.quantity,
        initialQuantity: item.quantity,
        supplierId: supplier.id,
        createdAt: now,
        updatedAt: now,
      };
      batchStore.put(newBatch);
      allBatches.push(newBatch);
    }

    const subtotal = Math.round(item.quantity * item.purchasePrice * 100) / 100;
    purchaseItems.push({
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      batchId,
      batchNumber: trimmedBatch,
      manufacturingDate: item.manufacturingDate || purchaseDate,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      purchasePrice: Number(item.purchasePrice),
      sellingPrice: Number(item.sellingPrice),
      subtotal,
    });

    tx.objectStore('inventoryTransactions').put({
      id: generateId('invtx'),
      date: purchaseDate,
      createdAt: now,
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      batchId,
      batchNumber: trimmedBatch,
      type: 'Purchase',
      quantityChange: item.quantity,
      quantityBefore: qtyBefore,
      quantityAfter: qtyAfter,
      reason: `Purchased from ${supplier.name}`,
      referenceNumber: input.supplierInvoiceNumber.trim(),
    } satisfies InventoryTransaction);
  }

  const totalAmount = Math.round(purchaseItems.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  const amountPaid = Math.min(totalAmount, Math.round(input.amountPaid * 100) / 100);
  const remainingBalance = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);
  const paymentStatus: Purchase['paymentStatus'] =
    remainingBalance === 0 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Unpaid';

  const purchase: Purchase = {
    id: generateId('pur'),
    supplierInvoiceNumber: input.supplierInvoiceNumber.trim(),
    date: purchaseDate,
    createdAt: now,
    supplierId: supplier.id,
    supplierName: supplier.name,
    items: purchaseItems,
    totalAmount,
    amountPaid,
    remainingBalance,
    paymentStatus,
    notes: input.notes?.trim(),
  };

  tx.objectStore('purchases').put(purchase);

  if (remainingBalance > 0) {
    const newPayable = Math.round((supplier.totalPayableBalance + remainingBalance) * 100) / 100;
    tx.objectStore('suppliers').put({
      ...supplier,
      totalPayableBalance: newPayable,
      updatedAt: now,
    });
    tx.objectStore('supplierTransactions').put({
      id: generateId('st'),
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: purchaseDate,
      createdAt: now,
      type: 'Purchase',
      amount: remainingBalance,
      balanceAfter: newPayable,
      referenceNumber: purchase.supplierInvoiceNumber,
      notes: `Unpaid balance from supplier invoice ${purchase.supplierInvoiceNumber}`,
    } satisfies SupplierTransaction);
  }

  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'PURCHASE_RECORDED',
    entityType: 'purchase',
    entityId: purchase.id,
    summary: `Recorded purchase ${purchase.supplierInvoiceNumber} from "${supplier.name}" totaling Rs. ${totalAmount}.`,
  } satisfies AuditLog);

  await txDone(tx);
  return purchase;
}

export async function saveCustomer(input: {
  id?: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
}): Promise<Customer> {
  if (!input.name.trim()) throw new Error('Customer name is required.');
  if (!input.phone.trim()) throw new Error('Customer phone number is required.');

  const now = new Date().toISOString();
  const db = await openDatabase();
  const tx = db.transaction(['customers', 'auditLogs'], 'readwrite');
  const store = tx.objectStore('customers');

  let customer: Customer;
  if (input.id) {
    const existing = await reqToPromise<Customer | undefined>(store.get(input.id));
    if (!existing) throw new Error('Customer not found.');
    customer = {
      ...existing,
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address?.trim(),
      notes: input.notes?.trim(),
      updatedAt: now,
    };
  } else {
    customer = {
      id: generateId('cust'),
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address?.trim(),
      notes: input.notes?.trim(),
      totalCreditBalance: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
  store.put(customer);
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: input.id ? 'CUSTOMER_UPDATED' : 'CUSTOMER_CREATED',
    entityType: 'customer',
    entityId: customer.id,
    summary: `${input.id ? 'Updated' : 'Added'} customer "${customer.name}".`,
  } satisfies AuditLog);

  await txDone(tx);
  return customer;
}

export async function recordCustomerPayment(input: {
  customerId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  notes?: string;
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }

  const now = new Date().toISOString();
  const db = await openDatabase();
  const tx = db.transaction(['customers', 'customerTransactions', 'auditLogs'], 'readwrite');
  const custStore = tx.objectStore('customers');
  const customer = await reqToPromise<Customer | undefined>(custStore.get(input.customerId));
  if (!customer) throw new Error('Customer not found.');
  if (input.amount > customer.totalCreditBalance + 0.01) {
    throw new Error(`Payment (Rs. ${input.amount}) cannot exceed outstanding balance (Rs. ${customer.totalCreditBalance}).`);
  }

  const paid = Math.round(input.amount * 100) / 100;
  const newBalance = Math.max(0, Math.round((customer.totalCreditBalance - paid) * 100) / 100);
  custStore.put({
    ...customer,
    totalCreditBalance: newBalance,
    updatedAt: now,
  });

  const ref = `PAY-${Date.now().toString().slice(-6)}`;
  tx.objectStore('customerTransactions').put({
    id: generateId('ct'),
    customerId: customer.id,
    customerName: customer.name,
    date: input.date || todayISO(),
    createdAt: now,
    type: 'Payment Received',
    amount: paid,
    balanceAfter: newBalance,
    referenceNumber: ref,
    paymentMethod: input.paymentMethod || 'Cash',
    notes: input.notes?.trim() || 'Credit payment received',
  } satisfies CustomerTransaction);

  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'CUSTOMER_PAYMENT',
    entityType: 'customer',
    entityId: customer.id,
    summary: `Received Rs. ${paid} from "${customer.name}" (Remaining balance: Rs. ${newBalance}).`,
  } satisfies AuditLog);

  await txDone(tx);
}

export async function saveSupplier(input: {
  id?: string;
  name: string;
  contactPerson?: string;
  phone: string;
  address?: string;
  notes?: string;
}): Promise<Supplier> {
  if (!input.name.trim()) throw new Error('Supplier name is required.');
  if (!input.phone.trim()) throw new Error('Supplier phone number is required.');

  const now = new Date().toISOString();
  const db = await openDatabase();
  const tx = db.transaction(['suppliers', 'auditLogs'], 'readwrite');
  const store = tx.objectStore('suppliers');

  let supplier: Supplier;
  if (input.id) {
    const existing = await reqToPromise<Supplier | undefined>(store.get(input.id));
    if (!existing) throw new Error('Supplier not found.');
    supplier = {
      ...existing,
      name: input.name.trim(),
      contactPerson: input.contactPerson?.trim(),
      phone: input.phone.trim(),
      address: input.address?.trim(),
      notes: input.notes?.trim(),
      updatedAt: now,
    };
  } else {
    supplier = {
      id: generateId('sup'),
      name: input.name.trim(),
      contactPerson: input.contactPerson?.trim(),
      phone: input.phone.trim(),
      address: input.address?.trim(),
      notes: input.notes?.trim(),
      totalPayableBalance: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  store.put(supplier);
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: input.id ? 'SUPPLIER_UPDATED' : 'SUPPLIER_CREATED',
    entityType: 'supplier',
    entityId: supplier.id,
    summary: `${input.id ? 'Updated' : 'Added'} supplier "${supplier.name}".`,
  } satisfies AuditLog);

  await txDone(tx);
  return supplier;
}

export async function recordSupplierPayment(input: {
  supplierId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  notes?: string;
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }

  const now = new Date().toISOString();
  const db = await openDatabase();
  const tx = db.transaction(['suppliers', 'supplierTransactions', 'auditLogs'], 'readwrite');
  const supStore = tx.objectStore('suppliers');
  const supplier = await reqToPromise<Supplier | undefined>(supStore.get(input.supplierId));
  if (!supplier) throw new Error('Supplier not found.');
  if (input.amount > supplier.totalPayableBalance + 0.01) {
    throw new Error(`Payment (Rs. ${input.amount}) cannot exceed payable balance (Rs. ${supplier.totalPayableBalance}).`);
  }

  const paid = Math.round(input.amount * 100) / 100;
  const newBalance = Math.max(0, Math.round((supplier.totalPayableBalance - paid) * 100) / 100);
  supStore.put({
    ...supplier,
    totalPayableBalance: newBalance,
    updatedAt: now,
  });

  const ref = `SPAY-${Date.now().toString().slice(-6)}`;
  tx.objectStore('supplierTransactions').put({
    id: generateId('st'),
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: input.date || todayISO(),
    createdAt: now,
    type: 'Payment Made',
    amount: paid,
    balanceAfter: newBalance,
    referenceNumber: ref,
    paymentMethod: input.paymentMethod || 'Cash',
    notes: input.notes?.trim() || 'Supplier payment made',
  } satisfies SupplierTransaction);

  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'SUPPLIER_PAYMENT',
    entityType: 'supplier',
    entityId: supplier.id,
    summary: `Paid Rs. ${paid} to supplier "${supplier.name}" (Remaining payable: Rs. ${newBalance}).`,
  } satisfies AuditLog);

  await txDone(tx);
}

export async function addExpenseRecord(input: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> {
  if (!input.title.trim()) throw new Error('Expense description is required.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Expense amount must be greater than 0.');
  }

  const now = new Date().toISOString();
  const expense: Expense = {
    ...input,
    id: generateId('exp'),
    title: input.title.trim(),
    amount: Math.round(input.amount * 100) / 100,
    notes: input.notes?.trim(),
    createdAt: now,
  };

  const db = await openDatabase();
  const tx = db.transaction(['expenses', 'auditLogs'], 'readwrite');
  tx.objectStore('expenses').put(expense);
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: now,
    action: 'EXPENSE_ADDED',
    entityType: 'expense',
    entityId: expense.id,
    summary: `Recorded ${expense.category} expense "${expense.title}" for Rs. ${expense.amount}.`,
  } satisfies AuditLog);
  await txDone(tx);
  return expense;
}

export async function deleteExpenseRecord(expenseId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['expenses', 'auditLogs'], 'readwrite');
  const existing = await reqToPromise<Expense | undefined>(tx.objectStore('expenses').get(expenseId));
  if (!existing) throw new Error('Expense record not found.');
  tx.objectStore('expenses').delete(expenseId);
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: new Date().toISOString(),
    action: 'EXPENSE_DELETED',
    entityType: 'expense',
    entityId: expenseId,
    summary: `Deleted expense "${existing.title}" (Rs. ${existing.amount}).`,
  } satisfies AuditLog);
  await txDone(tx);
}

export async function exportBackupPayload(): Promise<BackupPayload> {
  const snapshot = await loadFullSnapshot();
  const data = {
    medicines: snapshot.medicines,
    batches: snapshot.batches,
    sales: snapshot.sales,
    purchases: snapshot.purchases,
    customers: snapshot.customers,
    customerTransactions: snapshot.customerTransactions,
    suppliers: snapshot.suppliers,
    supplierTransactions: snapshot.supplierTransactions,
    expenses: snapshot.expenses,
    inventoryTransactions: snapshot.inventoryTransactions,
    auditLogs: snapshot.auditLogs,
    storeProfile: snapshot.storeProfile,
  };
  const checksum = await computeSha256(JSON.stringify(data));
  return {
    app: 'MedLedgerPK',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    checksum,
    data,
  };
}

export async function validateAndRestoreBackup(rawText: string): Promise<{ counts: Record<string, number> }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup structure.');
  }

  const payload = parsed as Partial<BackupPayload>;
  if (payload.app !== 'MedLedgerPK' || typeof payload.schemaVersion !== 'number' || !payload.data) {
    throw new Error('This JSON file is not a recognized MedLedger PK backup.');
  }

  const requiredArrays: Array<keyof BackupPayload['data']> = [
    'medicines',
    'batches',
    'sales',
    'purchases',
    'customers',
    'customerTransactions',
    'suppliers',
    'supplierTransactions',
    'expenses',
    'inventoryTransactions',
    'auditLogs',
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(payload.data[key])) {
      throw new Error(`Backup file is missing or corrupt in section: "${key}".`);
    }
  }

  if (payload.checksum) {
    const computed = await computeSha256(JSON.stringify(payload.data));
    if (computed !== payload.checksum) {
      throw new Error('Backup integrity check failed: the file appears to have been modified or corrupted.');
    }
  }

  const d = payload.data;
  const db = await openDatabase();
  const storesToClear: StoreName[] = [
    'medicines',
    'batches',
    'sales',
    'purchases',
    'customers',
    'customerTransactions',
    'suppliers',
    'supplierTransactions',
    'expenses',
    'inventoryTransactions',
    'auditLogs',
  ];

  const tx = db.transaction([...storesToClear, 'settings'], 'readwrite');
  for (const s of storesToClear) {
    tx.objectStore(s).clear();
  }

  for (const m of d.medicines) tx.objectStore('medicines').put(m);
  for (const b of d.batches) tx.objectStore('batches').put(b);
  for (const s of d.sales) tx.objectStore('sales').put(s);
  for (const p of d.purchases) tx.objectStore('purchases').put(p);
  for (const c of d.customers) tx.objectStore('customers').put(c);
  for (const ct of d.customerTransactions) tx.objectStore('customerTransactions').put(ct);
  for (const sup of d.suppliers) tx.objectStore('suppliers').put(sup);
  for (const st of d.supplierTransactions) tx.objectStore('supplierTransactions').put(st);
  for (const e of d.expenses) tx.objectStore('expenses').put(e);
  for (const it of d.inventoryTransactions) tx.objectStore('inventoryTransactions').put(it);
  for (const a of d.auditLogs) tx.objectStore('auditLogs').put(a);

  if (d.storeProfile) {
    tx.objectStore('settings').put({ key: 'storeProfile', value: d.storeProfile });
  }

  // Update invoice counter safely beyond restored sales
  const maxInv = d.sales.reduce((max, s) => {
    const num = parseInt(s.invoiceNumber.replace(/\D/g, ''), 10);
    return Number.isFinite(num) && num > max ? num : max;
  }, 1000);
  tx.objectStore('settings').put({ key: 'invoiceCounter', value: maxInv });

  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: new Date().toISOString(),
    action: 'BACKUP_RESTORED',
    entityType: 'system',
    entityId: 'backup',
    summary: `Restored local database from backup exported on ${payload.exportedAt || 'unknown date'}.`,
  } satisfies AuditLog);

  await txDone(tx);

  return {
    counts: {
      medicines: d.medicines.length,
      batches: d.batches.length,
      sales: d.sales.length,
      purchases: d.purchases.length,
      customers: d.customers.length,
      suppliers: d.suppliers.length,
    },
  };
}

export async function clearAllDatabaseRecords(): Promise<void> {
  const db = await openDatabase();
  const stores: StoreName[] = [
    'medicines',
    'batches',
    'sales',
    'purchases',
    'customers',
    'customerTransactions',
    'suppliers',
    'supplierTransactions',
    'expenses',
    'inventoryTransactions',
    'auditLogs',
  ];
  const tx = db.transaction([...stores, 'settings'], 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  tx.objectStore('settings').put({ key: 'invoiceCounter', value: 1000 });
  tx.objectStore('auditLogs').put({
    id: generateId('aud'),
    timestamp: new Date().toISOString(),
    action: 'DATABASE_CLEARED',
    entityType: 'system',
    entityId: 'all',
    summary: 'Cleared all store records from local IndexedDB.',
  } satisfies AuditLog);
  await txDone(tx);
}

export async function seedSamplePakistanPharmacyData(): Promise<void> {
  const now = new Date().toISOString();
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const twoDaysAgo = addDaysISO(today, -2);

  const sup1Id = 'sup_demo_1';
  const sup2Id = 'sup_demo_2';
  const suppliers: Supplier[] = [
    {
      id: sup1Id,
      name: 'Lahore Pharma Distributors',
      contactPerson: 'Haji Muhammad Tariq',
      phone: '0321-4455667',
      address: 'Lohari Gate Medicine Market, Lahore',
      totalPayableBalance: 14500,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: sup2Id,
      name: 'PakMed Supply Co.',
      contactPerson: 'Usman Akram',
      phone: '0300-7788990',
      address: 'Katchery Road, Multan',
      totalPayableBalance: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const cust1Id = 'cust_demo_1';
  const cust2Id = 'cust_demo_2';
  const customers: Customer[] = [
    {
      id: cust1Id,
      name: 'Chaudhary Rashid Ahmed',
      phone: '0301-8899112',
      address: 'Mohalla Islampura, Street 4',
      totalCreditBalance: 1850,
      notes: 'Regular monthly chronic medication account',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: cust2Id,
      name: 'Bibi Fatima Clinic',
      phone: '0333-5544332',
      address: 'Near Civil Hospital Chowk',
      totalCreditBalance: 3200,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const medicines: Medicine[] = [
    {
      id: 'med_demo_1',
      name: 'Panadol 500mg Tablets',
      genericName: 'Paracetamol',
      brand: 'GSK Pakistan',
      category: 'Tablets',
      barcode: '896100100101',
      minStockLevel: 50,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'med_demo_2',
      name: 'Augmentin 625mg Tablets',
      genericName: 'Amoxicillin + Clavulanic Acid',
      brand: 'GSK Pakistan',
      category: 'Tablets',
      barcode: '896100100102',
      minStockLevel: 20,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'med_demo_3',
      name: 'Risek 20mg Capsules',
      genericName: 'Omeprazole',
      brand: 'Getz Pharma',
      category: 'Capsules',
      barcode: '896100100103',
      minStockLevel: 30,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'med_demo_4',
      name: 'Brufen 120ml Syrup',
      genericName: 'Ibuprofen',
      brand: 'Abbott Pakistan',
      category: 'Syrups',
      barcode: '896100100104',
      minStockLevel: 15,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'med_demo_5',
      name: 'Flagyl 400mg Tablets',
      genericName: 'Metronidazole',
      brand: 'Sanofi Pakistan',
      category: 'Tablets',
      barcode: '896100100105',
      minStockLevel: 40,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'med_demo_6',
      name: 'Rigix 10mg Tablets',
      genericName: 'Cetirizine',
      brand: 'AGP Limited',
      category: 'Tablets',
      barcode: '896100100106',
      minStockLevel: 25,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // Include multi-batch with safe, 30d, 60d, 90d, and expired batches for immediate realistic testing
  const batches: MedicineBatch[] = [
    {
      id: 'bat_demo_1a',
      medicineId: 'med_demo_1',
      batchNumber: 'PN-2401',
      manufacturingDate: addDaysISO(today, -320),
      expiryDate: addDaysISO(today, 22), // <= 30 days alert
      purchasePrice: 3.2,
      sellingPrice: 4.0,
      quantity: 80,
      initialQuantity: 200,
      supplierId: sup1Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bat_demo_1b',
      medicineId: 'med_demo_1',
      batchNumber: 'PN-2508',
      manufacturingDate: addDaysISO(today, -60),
      expiryDate: addDaysISO(today, 420), // safe newer batch at different price
      purchasePrice: 3.5,
      sellingPrice: 4.5,
      quantity: 240,
      initialQuantity: 240,
      supplierId: sup1Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bat_demo_2a',
      medicineId: 'med_demo_2',
      batchNumber: 'AG-8812',
      manufacturingDate: addDaysISO(today, -150),
      expiryDate: addDaysISO(today, 260),
      purchasePrice: 38,
      sellingPrice: 46,
      quantity: 14, // low stock (<20)
      initialQuantity: 60,
      supplierId: sup1Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bat_demo_3a',
      medicineId: 'med_demo_3',
      batchNumber: 'RK-1109',
      manufacturingDate: addDaysISO(today, -200),
      expiryDate: addDaysISO(today, 52), // <= 60 days alert
      purchasePrice: 14,
      sellingPrice: 18,
      quantity: 70,
      initialQuantity: 100,
      supplierId: sup2Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bat_demo_4a',
      medicineId: 'med_demo_4',
      batchNumber: 'BR-4410',
      manufacturingDate: addDaysISO(today, -400),
      expiryDate: addDaysISO(today, -12), // EXPIRED batch (blocked in POS!)
      purchasePrice: 110,
      sellingPrice: 135,
      quantity: 6,
      initialQuantity: 24,
      supplierId: sup2Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bat_demo_4b',
      medicineId: 'med_demo_4',
      batchNumber: 'BR-5520',
      manufacturingDate: addDaysISO(today, -30),
      expiryDate: addDaysISO(today, 360),
      purchasePrice: 118,
      sellingPrice: 145,
      quantity: 22,
      initialQuantity: 24,
      supplierId: sup2Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bat_demo_5a',
      medicineId: 'med_demo_5',
      batchNumber: 'FL-709',
      manufacturingDate: addDaysISO(today, -180),
      expiryDate: addDaysISO(today, 82), // <= 90 days alert
      purchasePrice: 4.5,
      sellingPrice: 6.0,
      quantity: 120,
      initialQuantity: 150,
      supplierId: sup1Id,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bat_demo_6a',
      medicineId: 'med_demo_6',
      batchNumber: 'RG-332',
      manufacturingDate: addDaysISO(today, -90),
      expiryDate: addDaysISO(today, 300),
      purchasePrice: 11,
      sellingPrice: 15,
      quantity: 90,
      initialQuantity: 100,
      supplierId: sup2Id,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const purchases: Purchase[] = [
    {
      id: 'pur_demo_1',
      supplierInvoiceNumber: 'LPD-9041',
      date: twoDaysAgo,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      supplierId: sup1Id,
      supplierName: 'Lahore Pharma Distributors',
      items: [
        {
          medicineId: 'med_demo_1',
          medicineName: 'Panadol 500mg Tablets',
          batchId: 'bat_demo_1b',
          batchNumber: 'PN-2508',
          manufacturingDate: addDaysISO(today, -60),
          expiryDate: addDaysISO(today, 420),
          quantity: 240,
          purchasePrice: 3.5,
          sellingPrice: 4.5,
          subtotal: 840,
        },
        {
          medicineId: 'med_demo_2',
          medicineName: 'Augmentin 625mg Tablets',
          batchId: 'bat_demo_2a',
          batchNumber: 'AG-8812',
          manufacturingDate: addDaysISO(today, -150),
          expiryDate: addDaysISO(today, 260),
          quantity: 60,
          purchasePrice: 38,
          sellingPrice: 46,
          subtotal: 2280,
        },
      ],
      totalAmount: 19500,
      amountPaid: 5000,
      remainingBalance: 14500,
      paymentStatus: 'Partial',
      notes: 'Monthly bulk restock',
    },
  ];

  const sales: Sale[] = [
    {
      id: 'sale_demo_1',
      invoiceNumber: 'INV-01001',
      date: yesterday,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      customerId: cust1Id,
      customerName: 'Chaudhary Rashid Ahmed',
      items: [
        {
          medicineId: 'med_demo_2',
          medicineName: 'Augmentin 625mg Tablets',
          genericName: 'Amoxicillin + Clavulanic Acid',
          batchId: 'bat_demo_2a',
          batchNumber: 'AG-8812',
          expiryDate: addDaysISO(today, 260),
          quantity: 30,
          unitPurchasePrice: 38,
          unitSellingPrice: 46,
          subtotal: 1380,
        },
        {
          medicineId: 'med_demo_3',
          medicineName: 'Risek 20mg Capsules',
          genericName: 'Omeprazole',
          batchId: 'bat_demo_3a',
          batchNumber: 'RK-1109',
          expiryDate: addDaysISO(today, 52),
          quantity: 30,
          unitPurchasePrice: 14,
          unitSellingPrice: 18,
          subtotal: 540,
        },
      ],
      subtotal: 1920,
      discount: 70,
      totalAmount: 1850,
      amountPaid: 0,
      remainingBalance: 1850,
      paymentMethod: 'Credit',
    },
    {
      id: 'sale_demo_2',
      invoiceNumber: 'INV-01002',
      date: today,
      createdAt: now,
      customerName: 'Walk-in Customer',
      items: [
        {
          medicineId: 'med_demo_1',
          medicineName: 'Panadol 500mg Tablets',
          genericName: 'Paracetamol',
          batchId: 'bat_demo_1a',
          batchNumber: 'PN-2401',
          expiryDate: addDaysISO(today, 22),
          quantity: 40,
          unitPurchasePrice: 3.2,
          unitSellingPrice: 4.0,
          subtotal: 160,
        },
        {
          medicineId: 'med_demo_4',
          medicineName: 'Brufen 120ml Syrup',
          genericName: 'Ibuprofen',
          batchId: 'bat_demo_4b',
          batchNumber: 'BR-5520',
          expiryDate: addDaysISO(today, 360),
          quantity: 2,
          unitPurchasePrice: 118,
          unitSellingPrice: 145,
          subtotal: 290,
        },
        {
          medicineId: 'med_demo_6',
          medicineName: 'Rigix 10mg Tablets',
          genericName: 'Cetirizine',
          batchId: 'bat_demo_6a',
          batchNumber: 'RG-332',
          expiryDate: addDaysISO(today, 300),
          quantity: 10,
          unitPurchasePrice: 11,
          unitSellingPrice: 15,
          subtotal: 150,
        },
      ],
      subtotal: 600,
      discount: 0,
      totalAmount: 600,
      amountPaid: 600,
      remainingBalance: 0,
      paymentMethod: 'Cash',
    },
  ];

  const customerTransactions: CustomerTransaction[] = [
    {
      id: 'ct_demo_1',
      customerId: cust1Id,
      customerName: 'Chaudhary Rashid Ahmed',
      date: yesterday,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      type: 'Sale Credit',
      amount: 1850,
      balanceAfter: 1850,
      referenceNumber: 'INV-01001',
      paymentMethod: 'Credit',
      notes: 'Credit balance from invoice INV-01001',
    },
    {
      id: 'ct_demo_2',
      customerId: cust2Id,
      customerName: 'Bibi Fatima Clinic',
      date: twoDaysAgo,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      type: 'Sale Credit',
      amount: 3200,
      balanceAfter: 3200,
      referenceNumber: 'OPENING-BAL',
      paymentMethod: 'Credit',
      notes: 'Previous clinic supply balance',
    },
  ];

  const supplierTransactions: SupplierTransaction[] = [
    {
      id: 'st_demo_1',
      supplierId: sup1Id,
      supplierName: 'Lahore Pharma Distributors',
      date: twoDaysAgo,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      type: 'Purchase',
      amount: 14500,
      balanceAfter: 14500,
      referenceNumber: 'LPD-9041',
      notes: 'Partial payment Rs. 5,000 paid on delivery',
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'exp_demo_1',
      date: twoDaysAgo,
      category: 'Electricity',
      title: 'LESCO Electricity Bill (Shop)',
      amount: 4200,
      paymentMethod: 'Cash',
      createdAt: now,
    },
  ];

  const inventoryTransactions: InventoryTransaction[] = [
    {
      id: 'invtx_demo_1',
      date: twoDaysAgo,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      medicineId: 'med_demo_1',
      medicineName: 'Panadol 500mg Tablets',
      batchId: 'bat_demo_1b',
      batchNumber: 'PN-2508',
      type: 'Purchase',
      quantityChange: 240,
      quantityBefore: 0,
      quantityAfter: 240,
      reason: 'Purchased from Lahore Pharma Distributors',
      referenceNumber: 'LPD-9041',
    },
    {
      id: 'invtx_demo_2',
      date: today,
      createdAt: now,
      medicineId: 'med_demo_1',
      medicineName: 'Panadol 500mg Tablets',
      batchId: 'bat_demo_1a',
      batchNumber: 'PN-2401',
      type: 'Sale',
      quantityChange: -40,
      quantityBefore: 120,
      quantityAfter: 80,
      reason: 'Sold on invoice INV-01002',
      referenceNumber: 'INV-01002',
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'aud_demo_1',
      timestamp: now,
      action: 'DEMO_DATA_LOADED',
      entityType: 'system',
      entityId: 'seed',
      summary: 'Loaded realistic Pakistan medical store demonstration records.',
    },
  ];

  const db = await openDatabase();
  const tx = db.transaction([...STORE_NAMES], 'readwrite');
  for (const s of STORE_NAMES) {
    if (s !== 'settings') tx.objectStore(s).clear();
  }

  for (const s of suppliers) tx.objectStore('suppliers').put(s);
  for (const c of customers) tx.objectStore('customers').put(c);
  for (const m of medicines) tx.objectStore('medicines').put(m);
  for (const b of batches) tx.objectStore('batches').put(b);
  for (const p of purchases) tx.objectStore('purchases').put(p);
  for (const sl of sales) tx.objectStore('sales').put(sl);
  for (const ct of customerTransactions) tx.objectStore('customerTransactions').put(ct);
  for (const st of supplierTransactions) tx.objectStore('supplierTransactions').put(st);
  for (const ex of expenses) tx.objectStore('expenses').put(ex);
  for (const it of inventoryTransactions) tx.objectStore('inventoryTransactions').put(it);
  for (const a of auditLogs) tx.objectStore('auditLogs').put(a);
  tx.objectStore('settings').put({ key: 'invoiceCounter', value: 1002 });

  await txDone(tx);
}
