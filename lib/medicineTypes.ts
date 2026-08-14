export interface Medicine {
  id: string;
  name: string;
  category: string;
  batchNo: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  buyingDiscount: number;
  supplier: string;
  expiryDate: string;
}

export interface Draft {
  id: string | null;
  name: string;
  category: string;
  batchNo: string;
  quantity: string;
  purchasePrice: string;
  sellingPrice: string;
  buyingDiscount: string;
  supplier: string;
  expiryDate: string;
}

export interface CartItem {
  medicineId: string;
  medicineName: string;
  batchNo: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  returnedQuantity?: number;
}

export interface Sale {
  id: string;
  medicineId: string;
  medicineName: string;
  batchNo: string;
  quantitySold: number;
  unitPrice: number;
  totalPrice: number;
  date: string;
  customerName: string;
  returnedQuantity: number;
  items?: CartItem[]; // For bulk sales with multiple items
  /** Sum of item line totals before any discount is applied. */
  subtotal?: number;
  /** Customer discount value (percent number or flat amount depending on discountType). */
  discount?: number;
  /** How the discount is interpreted. */
  discountType?: "percent" | "amount";
  /** Actual currency amount deducted from the bill. */
  discountAmount?: number;
}

export interface DraftSale {
  medicineId: string;
  quantitySold: string;
  customerName: string;
}

export interface BulkDraftSale {
  customerName: string;
  items: CartItem[];
  /** Customer discount value (percent number or flat amount depending on discountType). */
  discount?: number;
  /** How the discount is interpreted. */
  discountType?: "percent" | "amount";
  /** Actual currency amount deducted from the bill. */
  discountAmount?: number;
}
