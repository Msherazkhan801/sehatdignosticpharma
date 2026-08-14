import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "./firebase";
import type { CartItem, Medicine, Sale } from "./medicineTypes";

const COLLECTION_NAME = "medicines";
const SALES_COLLECTION = "sales";

export async function listMedicines(): Promise<Medicine[]> {
  if (!isFirebaseConfigured) {
    return [];
  }

  const db = getFirebaseDb();
  if (!db) {
    return [];
  }

  const snapshot = await getDocs(query(collection(db, COLLECTION_NAME), orderBy("name")));
  return snapshot.docs.map((item) => {
    const data = item.data() as Omit<Medicine, "id">;
    return {
      id: item.id,
      ...data,
      name: data.name?.toUpperCase() ?? "",
      batchNo: data.batchNo?.toUpperCase() ?? "",
      buyingDiscount: Number(data.buyingDiscount) || 0,
    };
  });
}

export async function createMedicine(medicine: Omit<Medicine, "id">): Promise<Medicine> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), medicine);
  return { id: docRef.id, ...medicine };
}

export async function updateMedicine(medicine: Medicine): Promise<Medicine> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  const target = doc(db, COLLECTION_NAME, medicine.id);
  await updateDoc(target, {
    name: medicine.name,
    category: medicine.category,
    batchNo: medicine.batchNo,
    quantity: medicine.quantity,
    purchasePrice: medicine.purchasePrice,
    sellingPrice: medicine.sellingPrice,
    buyingDiscount: medicine.buyingDiscount,
    supplier: medicine.supplier,
    expiryDate: medicine.expiryDate,
  });

  return medicine;
}

export async function deleteMedicine(id: string): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  await deleteDoc(doc(db, COLLECTION_NAME, id));
}

// ─── Sales ──────────────────────────────────────────────────────────────────

export async function recordSale(
  sale: Omit<Sale, "id">
): Promise<Sale> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  // 1. Deduct quantity from medicine inventory
  const medicineRef = doc(db, COLLECTION_NAME, sale.medicineId);
  const medSnapshot = await getDoc(medicineRef);

  if (!medSnapshot.exists()) {
    throw new Error("Medicine not found.");
  }

  const medData = medSnapshot.data() as Omit<Medicine, "id">;
  const currentQty = medData.quantity;

  if (currentQty < sale.quantitySold) {
    throw new Error(
      `Insufficient stock. Available: ${currentQty}, Requested: ${sale.quantitySold}`
    );
  }

  const newQty = currentQty - sale.quantitySold;
  await updateDoc(medicineRef, { quantity: newQty });

  // 2. Record the sale
  const saleData = {
    medicineId: sale.medicineId,
    medicineName: sale.medicineName,
    batchNo: sale.batchNo,
    quantitySold: sale.quantitySold,
    unitPrice: sale.unitPrice,
    totalPrice: sale.totalPrice,
    date: sale.date,
    customerName: sale.customerName,
    returnedQuantity: sale.returnedQuantity || 0,
  };

  const saleRef = await addDoc(collection(db, SALES_COLLECTION), saleData);
  return { id: saleRef.id, ...saleData };
}

export async function listSales(): Promise<Sale[]> {
  if (!isFirebaseConfigured) {
    return [];
  }

  const db = getFirebaseDb();
  if (!db) {
    return [];
  }

  const snapshot = await getDocs(
    query(collection(db, SALES_COLLECTION), orderBy("date", "desc"))
  );
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<Sale, "id">),
  }));
}

export async function deleteSale(saleId: string): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  await deleteDoc(doc(db, SALES_COLLECTION, saleId));
}

export async function clearSales(): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  const snapshot = await getDocs(collection(db, SALES_COLLECTION));
  const deleteOps = snapshot.docs.map((item) => deleteDoc(doc(db, SALES_COLLECTION, item.id)));
  await Promise.all(deleteOps);
}

export async function processReturn(
  saleId: string,
  returnQuantity: number,
  medicineId?: string // Required for multi-item sales: specify which item to return
): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  // 1. Get the sale record
  const saleRef = doc(db, SALES_COLLECTION, saleId);
  const saleSnap = await getDoc(saleRef);

  if (!saleSnap.exists()) {
    throw new Error("Sale record not found.");
  }

  const saleData = saleSnap.data() as Omit<Sale, "id">;
  const items = saleData.items;

  // Determine which medicine to return stock to
  let targetMedicineId: string;
  let alreadyReturned: number;
  let maxReturnable: number;

  if (items && items.length > 0) {
    // Bulk sale (single or multi item): find the specific item to return
    let itemIndex: number;
    if (medicineId) {
      itemIndex = items.findIndex((item) => item.medicineId === medicineId);
      if (itemIndex === -1) {
        throw new Error(`Item with medicine ID "${medicineId}" not found in this sale.`);
      }
    } else if (items.length === 1) {
      // Single-item bulk sale: auto-resolve the only item
      itemIndex = 0;
    } else {
      throw new Error("Please select an item to return.");
    }

    const item = items[itemIndex];
    const itemReturned = item.returnedQuantity || 0;
    maxReturnable = item.quantity - itemReturned;
    alreadyReturned = itemReturned;
    targetMedicineId = item.medicineId;

    if (returnQuantity > maxReturnable) {
      throw new Error(
        `Cannot return more than ${maxReturnable} of "${item.medicineName}". Already returned: ${itemReturned}`
      );
    }

    // Update the item's returned quantity in the items array
    items[itemIndex] = {
      ...item,
      returnedQuantity: itemReturned + returnQuantity,
    };
  } else {
    // Single-item sale: use top-level fields
    targetMedicineId = saleData.medicineId;
    alreadyReturned = saleData.returnedQuantity || 0;
    maxReturnable = saleData.quantitySold - alreadyReturned;

    if (returnQuantity > maxReturnable) {
      throw new Error(
        `Cannot return more than ${maxReturnable} items. Already returned: ${alreadyReturned}`
      );
    }
  }

  // 2. Add quantity back to the correct medicine inventory
  const medicineRef = doc(db, COLLECTION_NAME, targetMedicineId);
  const medSnap = await getDoc(medicineRef);

  if (!medSnap.exists()) {
    throw new Error("Medicine not found in inventory.");
  }

  const medData = medSnap.data() as Omit<Medicine, "id">;
  const updatedQty = medData.quantity + returnQuantity;
  await updateDoc(medicineRef, { quantity: updatedQty });

  // 3. Update sale record with returned quantity
  const newReturned = (saleData.returnedQuantity || 0) + returnQuantity;
  const updatePayload: Record<string, unknown> = {
    returnedQuantity: newReturned,
  };

  // If we have items array, persist the per-item returned quantities
  if (items && items.length > 0) {
    updatePayload.items = items;
  }

  await updateDoc(saleRef, updatePayload);
}

// ─── Bulk Sale ──────────────────────────────────────────────────────────────

export async function recordBulkSale(params: {
  customerName: string;
  items: CartItem[];
  discount?: number;
  discountType?: "percent" | "amount";
  discountAmount?: number;
}): Promise<Sale> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured yet.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore is unavailable.");
  }

  const { customerName, items, discount, discountType } = params;

  if (items.length === 0) {
    throw new Error("No items in sale.");
  }

  // 1. Deduct stock for each item
  for (const item of items) {
    const medicineRef = doc(db, COLLECTION_NAME, item.medicineId);
    const medSnapshot = await getDoc(medicineRef);

    if (!medSnapshot.exists()) {
      throw new Error(`Medicine "${item.medicineName}" not found in inventory.`);
    }

    const medData = medSnapshot.data() as Omit<Medicine, "id">;
    if (medData.quantity < item.quantity) {
      throw new Error(
        `Insufficient stock for "${item.medicineName}". Available: ${medData.quantity}, Requested: ${item.quantity}`
      );
    }

    await updateDoc(medicineRef, { quantity: medData.quantity - item.quantity });
  }

  // 2. Compute totals from the first item for backwards compatibility
  const firstItem = items[0];
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);

  // Apply customer discount (percentage or flat amount) to the actual bill
  let discountAmount = 0;
  if (discount && discount > 0) {
    if (discountType === "percent") {
      discountAmount = Math.min(subtotal * (Math.min(Math.max(discount, 0), 100) / 100), subtotal);
    } else {
      discountAmount = Math.min(discount, subtotal);
    }
  }
  discountAmount = Math.round(discountAmount * 100) / 100;
  const totalPrice = Math.max(subtotal - discountAmount, 0);

  // 3. Record the sale with all items
  const saleData: {
    medicineId: string;
    medicineName: string;
    batchNo: string;
    quantitySold: number;
    unitPrice: number;
    totalPrice: number;
    subtotal: number;
    date: string;
    customerName: string;
    returnedQuantity: number;
    items: CartItem[];
    discount?: number;
    discountType?: "percent" | "amount";
    discountAmount?: number;
  } = {
    medicineId: firstItem.medicineId,
    medicineName: firstItem.medicineName,
    batchNo: firstItem.batchNo,
    quantitySold: totalQty,
    unitPrice: firstItem.unitPrice,
    totalPrice,
    subtotal,
    date: new Date().toISOString(),
    customerName: customerName || "Walk-in Customer",
    returnedQuantity: 0,
    items, // Store all items for multi-item receipt
  };

  if (discount && discount > 0) {
    saleData.discount = discount;
    saleData.discountType = discountType;
  }
  if (discountAmount > 0) {
    saleData.discountAmount = discountAmount;
  }

  const saleRef = await addDoc(collection(db, SALES_COLLECTION), saleData);
  return { id: saleRef.id, ...saleData };
}
