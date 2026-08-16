"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Package,
  PlusCircle,
  Search,
  Pencil,
  Trash2,
  AlertTriangle,
  Cross,
  TrendingUp,
  Boxes,
  CircleAlert,
  CalendarClock,
  Sun,
  Moon,
  Menu,
  X,
  Database,
  RefreshCw,
  Loader2,
  ShoppingCart,
  Download,
  RotateCcw,
  Receipt,
  User,
  MinusCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  listMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  recordSale,
  listSales,
  processReturn,
  recordBulkSale,
  deleteSale,
  clearSales,
} from "@/lib/medicineService";
import { isFirebaseConfigured } from "@/lib/firebase";
import type {
  CartItem,
  Medicine,
  Draft,
  Sale,
  DraftSale,
  BulkDraftSale,
} from "@/lib/medicineTypes";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const palette = {
  ink: "#15332D",
  inkSoft: "#3E5850",
  paper: "#FBF7EF",
  paperDim: "#F1ECDF",
  mint: "#D7E9DD",
  mintDeep: "#1F6F5C",
  mintDeeper: "#154F41",
  amber: "#C98A2C",
  amberSoft: "#F3E1BE",
  red: "#B84A3E",
  redSoft: "#F1D9D3",
  line: "#D9D0BC",
};

const CATEGORIES = [
  "Tablet",
  "Syrup",
  "Capsule",
  "Injection",
  "Ointment",
  "Drops",
  "Surgical",
];
const CUSTOM_CATEGORY = "__custom__";
const LOW_STOCK_THRESHOLD = 4;

type Tone = "mint" | "amber" | "red" | "ink";
type Page = "dashboard" | "inventory" | "add" | "dailySell";

function daysUntil(dateStr: string): number {
  const today = new Date("2026-07-23T00:00:00");
  const target = new Date(dateStr + "T00:00:00");
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function expiryStatus(dateStr: string): "expired" | "soon" | "fresh" {
  const d = daysUntil(dateStr);
  if (d < 0) return "expired";
  if (d <= 60) return "soon";
  return "fresh";
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    category: CATEGORIES[0],
    batchNo: "",
    quantity: "",
    purchasePrice: "",
    sellingPrice: "",
    buyingDiscount: "",
    supplier: "",
    expiryDate: "",
  };
}

/** Buying rate after applying the buying discount (%). */
function effectiveCost(purchasePrice: number, buyingDiscount: number): number {
  const discount = Math.min(Math.max(Number(buyingDiscount) || 0, 0), 100);
  return Math.max((Number(purchasePrice) || 0) * (1 - discount / 100), 0);
}

/** Convert "beauty cream" -> "Beauty Cream" for clean custom categories. */
function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Pill({
  children,
  tone = "mint",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  const tones: Record<Tone, { bg: string; fg: string }> = {
    mint: { bg: palette.mint, fg: palette.mintDeeper },
    amber: { bg: palette.amberSoft, fg: "#8A5D1B" },
    red: { bg: palette.redSoft, fg: "#8C332A" },
    ink: { bg: palette.paperDim, fg: palette.ink },
  };
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

function LabelCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-lg p-5 ${className}`}
      style={{
        backgroundColor: "#fff",
        border: `1px solid ${palette.line}`,
        boxShadow: "0 1px 2px rgba(21,51,45,0.06)",
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-0"
        style={{
          borderTop: `2px dashed ${palette.line}`,
          transform: "translateY(-1px)",
        }}
      />
      {children}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "mint",
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  const tones: Record<Tone, { bg: string; fg: string }> = {
    mint: { bg: palette.mint, fg: palette.mintDeeper },
    amber: { bg: palette.amberSoft, fg: "#8A5D1B" },
    red: { bg: palette.redSoft, fg: "#8C332A" },
    ink: { bg: palette.paperDim, fg: palette.ink },
  };
  const t = tones[tone];
  return (
    <LabelCard className="flex items-center gap-4">
      <div
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{ width: 44, height: 44, backgroundColor: t.bg, color: t.fg }}
      >
        <Icon size={20} />
      </div>
      <div>
        <div
          className="text-xs font-mono tracking-wide uppercase"
          style={{ color: palette.inkSoft }}
        >
          {label}
        </div>
        <div
          className="text-2xl font-bold font-space"
          style={{ color: palette.ink }}
        >
          {value}
        </div>
      </div>
    </LabelCard>
  );
}

export default function OkPharmacyApp(): React.ReactElement {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [page, setPage] = useState<Page>("dashboard");
  const [dark, setDark] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [customCategory, setCustomCategory] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Daily Sell state
  const [sales, setSales] = useState<Sale[]>([]);
  const [sellDraft, setSellDraft] = useState<DraftSale>({
    medicineId: "",
    quantitySold: "",
    customerName: "",
  });
  const [sellError, setSellError] = useState<string>("");
  const [sellSuccess, setSellSuccess] = useState<string>("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState<boolean>(false);
  const [processingSale, setProcessingSale] = useState<boolean>(false);
  const [returningSale, setReturningSale] = useState<string | null>(null);
  const [returningMedicineId, setReturningMedicineId] = useState<string>("");
  const [returnQty, setReturnQty] = useState<string>("1");

  // Delete sale history state
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [confirmDeleteSaleId, setConfirmDeleteSaleId] = useState<string | null>(
    null,
  );
  const [clearAllConfirm, setClearAllConfirm] = useState<boolean>(false);
  const [saleHistoryError, setSaleHistoryError] = useState<string>("");
  const [saleHistorySuccess, setSaleHistorySuccess] = useState<string>("");

// Cart state for bulk sales
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartMedicineId, setCartMedicineId] = useState<string>("");
  const [cartQuantity, setCartQuantity] = useState<string>("1");
  const [cartCustomerName, setCartCustomerName] = useState<string>("");
  const [cartError, setCartError] = useState<string>("");
  // Searchable medicine dropdown state for the cart
  const [cartSearch, setCartSearch] = useState<string>("");
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const cartSearchRef = React.useRef<HTMLDivElement>(null);

  // Customer search for sales history
  const [customerSearch, setCustomerSearch] = useState<string>("");

  // Sales history date range filter
  const todayIso = new Date().toISOString().slice(0, 10);
  // Default the sales range to today so Daily Sell shows today's entries only
  const [saleFromDate, setSaleFromDate] = useState<string>(todayIso);
  const [saleToDate, setSaleToDate] = useState<string>(todayIso);

  // Customer discount applied on the cart bill
  const [cartDiscount, setCartDiscount] = useState<string>("");
  const [cartDiscountType, setCartDiscountType] = useState<
    "percent" | "amount"
  >("percent");

  // Fetch medicines from Firestore on mount
  const fetchMedicines = useCallback(async () => {
    if (!isFirebaseConfigured) {
      return;
    }
    try {
      setError("");
      const data = await listMedicines();
      setMedicines(data);
    } catch (err) {
      console.error("Failed to fetch medicines:", err);
      setError("Could not load medicines from the database.");
    }
  }, []);

  const fetchSales = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    try {
      const data = await listSales();
      setSales(data);
    } catch (err) {
      console.error("Failed to fetch sales:", err);
    }
  }, []);

  // 1. Derive initial loading state directly

  useEffect(() => {
    // If not configured, do nothing (loading is already false)
    if (!isFirebaseConfigured) return;

    let isSubscribed = true;

    const loadData = async () => {
      try {
        setLoading(true);
        await fetchMedicines();
        await fetchSales();
      } catch (err) {
        console.error(err);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, [fetchMedicines, fetchSales, isFirebaseConfigured]);

  const theme = dark
    ? {
        bg: "#0F1E1A",
        card: "#16302A",
        ink: "#F1ECDF",
        inkSoft: "#B9C9C1",
        line: "#274A40",
      }
    : {
        bg: palette.paper,
        card: "#fff",
        ink: palette.ink,
        inkSoft: palette.inkSoft,
        line: palette.line,
      };

  const stats = useMemo(() => {
    const total = medicines.length;
    const low = medicines.filter(
      (m) => m.quantity <= LOW_STOCK_THRESHOLD,
    ).length;
    const expired = medicines.filter(
      (m) => expiryStatus(m.expiryDate) === "expired",
    ).length;
    const categories = new Set(medicines.map((m) => m.category)).size;
    // Buying value of current stock uses the effective (discounted) buying rate.
    const buyingValue = medicines.reduce((sum, m) => {
      const qty = Number(m.quantity);
      const purchase = Number(m.purchasePrice);
      const discount = Number(m.buyingDiscount);

      return sum + qty * effectiveCost(purchase, discount);
    }, 0);

    const sellingValue = medicines.reduce((sum, m) => {
      return sum + Number(m.quantity) * Number(m.sellingPrice);
    }, 0);
    return { total, low, expired, categories, buyingValue, sellingValue };
  }, [medicines]);

  const profitLoss = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    for (const sale of sales) {
      const items = sale.items && sale.items.length > 0 ? sale.items : null;

      if (items) {
        // ── Bulk / multi-item sale ────────────────────────────────────────
        // Subtotal = sum of line totals before any customer discount.
        const subtotal =
          sale.subtotal && sale.subtotal > 0
            ? sale.subtotal
            : items.reduce((s, i) => s + (i.totalPrice || 0), 0);
        // Factor that proportionally allocates the customer discount across
        // each line item (revenue collected = totalPrice after discount).
        const discountFactor =
          subtotal > 0 ? (sale.totalPrice || 0) / subtotal : 1;

        for (const item of items) {
          const med = medicines.find((m) => m.id === item.medicineId);
          if (!med) continue;
          const itemQty = Number(item.quantity) || 0;
          if (itemQty <= 0) continue;
          const itemReturned = Number(item.returnedQuantity) || 0;
          const itemEffectiveQty = Math.max(itemQty - itemReturned, 0);

          // Revenue share = this line's billed amount (after customer
          // discount allocation), prorated for returned quantity.
          revenue +=
            (item.totalPrice || 0) *
            discountFactor *
            (itemEffectiveQty / itemQty);
          // Cost of goods sold uses the discounted buying rate per item.
          cost +=
            itemEffectiveQty *
            effectiveCost(med.purchasePrice, med.buyingDiscount);
        }
      } else {
        // ── Single-item sale ──────────────────────────────────────────────
        const med = medicines.find((m) => m.id === sale.medicineId);
        if (!med) continue;
        const effectiveQty = sale.quantitySold - (sale.returnedQuantity || 0);
        const returnedRatio =
          sale.quantitySold > 0 ? effectiveQty / sale.quantitySold : 0;
        // Revenue is the actual billed amount (after customer discount), prorated for returns.
        revenue += (sale.totalPrice || 0) * returnedRatio;
        // Cost of goods sold uses the discounted buying rate (higher earning).
        cost +=
          effectiveQty * effectiveCost(med.purchasePrice, med.buyingDiscount);
      }
    }
    const profit = revenue - cost;
    return { revenue, cost, profit };
  }, [sales, medicines]);

  const allCategoryOptions = useMemo(() => {
    const set = new Set<string>(CATEGORIES);
    medicines.forEach((m) => set.add(m.category));
    return Array.from(set);
  }, [medicines]);

  const stockByCategory = useMemo(() => {
    return allCategoryOptions
      .map((cat) => ({
        category: cat,
        quantity: medicines
          .filter((m) => m.category === cat)
          .reduce((s, m) => s + m.quantity, 0),
      }))
      .filter((c) => c.quantity > 0);
  }, [medicines, allCategoryOptions]);

  const expiryBreakdown = useMemo(() => {
    const fresh = medicines.filter(
      (m) => expiryStatus(m.expiryDate) === "fresh",
    ).length;
    const soon = medicines.filter(
      (m) => expiryStatus(m.expiryDate) === "soon",
    ).length;
    const expired = medicines.filter(
      (m) => expiryStatus(m.expiryDate) === "expired",
    ).length;
    return [
      { name: "Fresh", value: fresh, color: palette.mintDeep },
      { name: "Expiring soon", value: soon, color: palette.amber },
      { name: "Expired", value: expired, color: palette.red },
    ].filter((d) => d.value > 0);
  }, [medicines]);

  const lowStockList = useMemo(
    () =>
      medicines
        .filter((m) => m.quantity <= LOW_STOCK_THRESHOLD)
        .sort((a, b) => a.quantity - b.quantity),
    [medicines],
  );

  const recentMedicines = useMemo(
    () => [...medicines].slice(-10).reverse(),
    [medicines],
  );

  // Medicines that are expired or expiring soon (within 60 days), sorted by
  // nearest expiry date first.
  const expiringMedicines = useMemo(
    () =>
      medicines
        .filter((m) => expiryStatus(m.expiryDate) !== "fresh")
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [medicines],
  );

// Count only sales recorded today (for the Daily Sell header).
  const todaySalesCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return sales.filter(
      (s) => new Date(s.date).toISOString().slice(0, 10) === todayStr,
    ).length;
  }, [sales]);

  // Total sales amount recorded today (for the Daily Sell header).
  const todaySalesAmount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return sales
      .filter((s) => new Date(s.date).toISOString().slice(0, 10) === todayStr)
      .reduce((sum, s) => sum + (Number(s.totalPrice) || 0), 0);
  }, [sales]);

  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.batchNo.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "All" || m.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [medicines, search, categoryFilter]);

  // Cart totals (subtotal, customer discount, grand total)
  const cartSubtotal = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.totalPrice, 0),
    [cartItems],
  );

  const cartDiscountAmount = useMemo(() => {
    const dv = Number(cartDiscount) || 0;
    if (dv <= 0) return 0;
    const da =
      cartDiscountType === "percent"
        ? cartSubtotal * (Math.min(Math.max(dv, 0), 100) / 100)
        : dv;
    return Math.min(Math.max(da, 0), cartSubtotal);
  }, [cartDiscount, cartDiscountType, cartSubtotal]);

const cartGrandTotal = useMemo(
    () => Math.max(cartSubtotal - cartDiscountAmount, 0),
    [cartSubtotal, cartDiscountAmount],
  );

  // Medicines filtered by the search query in the cart's medicine dropdown.
  const cartFilteredMedicines = useMemo(() => {
    const q = cartSearch.trim().toLowerCase();
    const list = q
      ? medicines.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.batchNo.toLowerCase().includes(q),
        )
      : medicines;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [medicines, cartSearch]);

  // Close the cart medicine dropdown when clicking outside of it.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        cartSearchRef.current &&
        !cartSearchRef.current.contains(e.target as Node)
      ) {
        setCartOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function startEdit(med: Medicine) {
    const isPresetCategory = CATEGORIES.includes(med.category);
    setDraft({
      ...med,
      category: isPresetCategory ? med.category : CUSTOM_CATEGORY,
      quantity: String(med.quantity),
      purchasePrice: String(med.purchasePrice),
      sellingPrice: String(med.sellingPrice),
      buyingDiscount: String(med.buyingDiscount),
    });
    // If the medicine's category is not one of the presets, treat it as a custom category.
    setCustomCategory(isPresetCategory ? "" : med.category);
    setFormError("");
    setSuccessMessage("");
    setPage("add");
  }

  async function removeMedicine(id: string) {
    if (!isFirebaseConfigured) return;
    try {
      await deleteMedicine(id);
      setMedicines((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete medicine:", err);
      setFormError("Could not delete medicine. Please try again.");
    }
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (
      !draft.name.trim() ||
      !draft.batchNo.trim() ||
      !draft.quantity ||
      !draft.expiryDate
    ) {
      setFormError(
        "Fill in medicine name, batch number, quantity, and expiry date.",
      );
      return;
    }
    if (draft.category === CUSTOM_CATEGORY && !customCategory.trim()) {
      setFormError("Please enter a custom category name.");
      return;
    }
    if (!isFirebaseConfigured) {
      setFormError(
        "Firebase is not configured. Please set up your environment variables.",
      );
      return;
    }

    setSaving(true);
    setFormError("");
    setSuccessMessage("");

    const name = draft.name.trim().toUpperCase();
    const batchNo = draft.batchNo.trim().toUpperCase();
    const quantity = Number(draft.quantity) || 0;
    const purchasePrice = Number(draft.purchasePrice) || 0;
    const sellingPrice = Number(draft.sellingPrice) || 0;
    const buyingDiscount = Number(draft.buyingDiscount) || 0;
    // Resolve final category (title-case the custom one, e.g. "beauty cream" -> "Beauty Cream")
    const category =
      draft.category === CUSTOM_CATEGORY
        ? toTitleCase(customCategory)
        : draft.category;

    try {
      if (draft.id) {
        // Update existing
        const payload: Medicine = {
          id: draft.id,
          name,
          category,
          batchNo,
          quantity,
          purchasePrice,
          sellingPrice,
          buyingDiscount,
          supplier: draft.supplier,
          expiryDate: draft.expiryDate,
        };
        await updateMedicine(payload);
        setMedicines((prev) =>
          prev.map((m) => (m.id === draft.id ? payload : m)),
        );
      } else {
        // Create new — merge if same name + same batch already exists
        const existing = medicines.find(
          (m) =>
            m.name.toLowerCase() === name.toLowerCase() &&
            m.batchNo.toLowerCase() === batchNo.toLowerCase(),
        );

        if (existing) {
          // Merge: add quantity to existing row
          const updated: Medicine = {
            ...existing,
            quantity: existing.quantity + quantity,
            purchasePrice,
            sellingPrice,
            buyingDiscount,
            category,
            supplier: draft.supplier || existing.supplier,
            expiryDate: draft.expiryDate || existing.expiryDate,
          };
          await updateMedicine(updated);
          setMedicines((prev) =>
            prev.map((m) => (m.id === existing.id ? updated : m)),
          );
          setSuccessMessage(
            `Added ${quantity} to existing "${existing.name}" (batch ${existing.batchNo}). Total stock: ${updated.quantity}`,
          );
          setDraft(emptyDraft());
          setFormError("");
          setSaving(false);
          return;
        }

        const newMed = await createMedicine({
          name,
          category,
          batchNo,
          quantity,
          purchasePrice,
          sellingPrice,
          buyingDiscount,
          supplier: draft.supplier,
          expiryDate: draft.expiryDate,
        });
        setMedicines((prev) => [...prev, newMed]);
        setSuccessMessage(`"${name}" added to inventory.`);
      }
      setDraft(emptyDraft());
      setFormError("");
      setPage("inventory");
    } catch (err) {
      console.error("Failed to save medicine:", err);
      setFormError("Could not save to the database. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const navItems: {
    key: Page;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
  }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "inventory", label: "Inventory", icon: Package },
    { key: "add", label: "Add Medicine", icon: PlusCircle },
    { key: "dailySell", label: "Daily Sell", icon: ShoppingCart },
  ];

  // ─── Cart Handlers ─────────────────────────────────────────────

  function handleAddToCart() {
    setCartError("");

    if (!cartMedicineId) {
      setCartError("Please select a medicine.");
      return;
    }

    const medicine = medicines.find((m) => m.id === cartMedicineId);
    if (!medicine) {
      setCartError("Selected medicine not found.");
      return;
    }

    const qty = Number(cartQuantity);
    if (!qty || qty <= 0) {
      setCartError("Enter a valid quantity.");
      return;
    }

    if (qty > medicine.quantity) {
      setCartError(`Insufficient stock. Available: ${medicine.quantity}`);
      return;
    }

    // Check if medicine already in cart
    const existingIndex = cartItems.findIndex(
      (item) => item.medicineId === medicine.id,
    );
    if (existingIndex >= 0) {
      // Update existing item
      const updated = [...cartItems];
      const newQty = updated[existingIndex].quantity + qty;
      if (newQty > medicine.quantity) {
        setCartError(
          `Total quantity (${newQty}) exceeds stock (${medicine.quantity}).`,
        );
        return;
      }
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        totalPrice: newQty * medicine.sellingPrice,
      };
      setCartItems(updated);
    } else {
      // Add new item
      const newItem: CartItem = {
        medicineId: medicine.id,
        medicineName: medicine.name,
        batchNo: medicine.batchNo,
        quantity: qty,
        unitPrice: medicine.sellingPrice,
        totalPrice: qty * medicine.sellingPrice,
      };
      setCartItems([...cartItems, newItem]);
    }

    setCartMedicineId("");
    setCartQuantity("1");
  }

  function handleRemoveCartItem(medicineId: string) {
    setCartItems((prev) =>
      prev.filter((item) => item.medicineId !== medicineId),
    );
  }

  async function handleBulkSell() {
    setCartError("");
    setSellError("");
    setSellSuccess("");

    if (cartItems.length === 0) {
      setCartError("Add at least one item to the cart.");
      return;
    }

    const subtotal = cartItems.reduce((sum, i) => sum + i.totalPrice, 0);
    const discountVal = Number(cartDiscount) || 0;
    let discountAmount = 0;
    if (discountVal > 0) {
      if (cartDiscountType === "percent") {
        discountAmount =
          subtotal * (Math.min(Math.max(discountVal, 0), 100) / 100);
      } else {
        discountAmount = discountVal;
      }
    }

    setProcessingSale(true);
    try {
      const newSale = await recordBulkSale({
        customerName: cartCustomerName || "Walk-in Customer",
        items: cartItems,
        discount: discountVal > 0 ? discountVal : undefined,
        discountType: discountVal > 0 ? cartDiscountType : undefined,
        discountAmount:
          discountAmount > 0 ? Math.min(discountAmount, subtotal) : undefined,
      });

      // Update local stock
      setMedicines((prev) =>
        prev.map((m) => {
          const cartItem = cartItems.find((c) => c.medicineId === m.id);
          return cartItem
            ? { ...m, quantity: m.quantity - cartItem.quantity }
            : m;
        }),
      );

      setSales((prev) => [newSale, ...prev]);
      setLastSale(newSale);
      setShowReceipt(true);
      setCartItems([]);
      setCartCustomerName("");
      setCartDiscount("");
      setCartDiscountType("percent");
      setSellSuccess(`Sale completed! ${cartItems.length} item(s) sold.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sale failed.";
      setCartError(msg);
    } finally {
      setProcessingSale(false);
    }
  }

  async function handleReturn(saleId: string, medicineId?: string) {
    const rqty = Number(returnQty);
    if (!rqty || rqty <= 0) {
      setSellError("Enter a valid return quantity.");
      return;
    }

    setProcessingSale(true);
    setSellError("");
    try {
      await processReturn(saleId, rqty, medicineId);

      // Find the sale to update local state
      const sale = sales.find((s) => s.id === saleId);
      if (sale) {
        const isBulk = sale.items && sale.items.length > 0;
        // For a 1-item bulk sale, auto-resolve the only item so its
        // per-item returnedQuantity is updated too (keeps dashboard totals correct).
        const targetMedicineId =
          isBulk && !medicineId && sale.items && sale.items.length === 1
            ? sale.items[0].medicineId
            : isBulk
              ? medicineId
              : sale.medicineId;

        if (isBulk) {
          // Bulk sale (single or multi item): update specific item + restock that medicine
          setMedicines((prev) =>
            prev.map((m) =>
              m.id === targetMedicineId
                ? { ...m, quantity: m.quantity + rqty }
                : m,
            ),
          );
          setSales((prev) =>
            prev.map((s) => {
              if (s.id !== saleId) return s;
              const updatedItems = s.items?.map((item) =>
                item.medicineId === targetMedicineId
                  ? {
                      ...item,
                      returnedQuantity: (item.returnedQuantity || 0) + rqty,
                    }
                  : item,
              );
              return {
                ...s,
                returnedQuantity: (s.returnedQuantity || 0) + rqty,
                items: updatedItems,
              };
            }),
          );
        } else {
          // Single-item sale
          setMedicines((prev) =>
            prev.map((m) =>
              m.id === sale.medicineId
                ? { ...m, quantity: m.quantity + rqty }
                : m,
            ),
          );
          setSales((prev) =>
            prev.map((s) =>
              s.id === saleId
                ? { ...s, returnedQuantity: (s.returnedQuantity || 0) + rqty }
                : s,
            ),
          );
        }
      }

      setReturningSale(null);
      setReturningMedicineId("");
      setReturnQty("1");
      setSellSuccess(`Returned ${rqty} items to inventory.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Return failed.";
      setSellError(msg);
    } finally {
      setProcessingSale(false);
    }
  }

  async function handleDeleteSale(saleId: string) {
    setSaleHistoryError("");
    setSaleHistorySuccess("");
    setDeletingSaleId(saleId);
    try {
      await deleteSale(saleId);
      setSales((prev) => prev.filter((s) => s.id !== saleId));
      setConfirmDeleteSaleId(null);
      setSaleHistorySuccess("Sale record deleted.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete sale record.";
      setSaleHistoryError(msg);
    } finally {
      setDeletingSaleId(null);
    }
  }

  async function handleClearAllSales() {
    setSaleHistoryError("");
    setSaleHistorySuccess("");
    setClearAllConfirm(true);
  }

  async function confirmClearAllSales() {
    setSaleHistoryError("");
    setSaleHistorySuccess("");
    try {
      await clearSales();
      setSales([]);
      setClearAllConfirm(false);
      setSaleHistorySuccess("All sales history cleared.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to clear sales history.";
      setSaleHistoryError(msg);
      setClearAllConfirm(false);
    }
  }

  return (
    <div
      style={{
        backgroundColor: theme.bg,
        color: theme.ink,
        minHeight: "100vh",
        transition: "background-color .2s",
      }}
    >
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          className={`fixed md:static z-20 top-0 left-0 h-full md:h-auto w-64 flex-shrink-0 flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
          style={{
            backgroundColor: dark ? "#102019" : palette.ink,
            color: palette.paper,
          }}
        >
          <div className="flex items-center gap-3 px-5 py-6">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 38,
                height: 38,
                backgroundColor: palette.mintDeep,
              }}
            >
              <Cross size={18} color={palette.paper} />
            </div>
            <div>
              <div className="font-bold leading-tight font-space">
                Brothers Pharmacy
              </div>
              <div className="text-xs" style={{ color: "#9FB6AC" }}>
                Inventory System
              </div>
            </div>
            <button
              className="ml-auto md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} color={palette.paper} />
            </button>
          </div>

          <nav className="flex-1 px-3 mt-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    setPage(item.key);
                    setSidebarOpen(false);
                    if (item.key === "add") {
                      setDraft(emptyDraft());
                      setFormError("");
                      setSuccessMessage("");
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: active ? palette.mintDeep : "transparent",
                    color: active ? "#fff" : "#C9D8CF",
                  }}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="px-5 py-5 text-xs" style={{ color: "#7E9A8E" }}>
            Brothers Pharmacy by Shezi Digital Med &copy; 2025
            <br /> All rights reserved.
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Column */}
        <div className="flex-1 min-w-0">
          <header
            className="flex items-center gap-3 px-5 py-4 sticky top-0 z-10"
            style={{
              backgroundColor: theme.bg,
              borderBottom: `1px solid ${theme.line}`,
            }}
          >
            <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-lg font-bold font-space">
                {page === "dashboard" && "Dashboard"}
                {page === "inventory" && "Inventory"}
                {page === "add" &&
                  (draft.id ? "Edit Medicine" : "Add Medicine")}
                {page === "dailySell" && "Daily Sell"}
              </h1>
              <p className="text-xs" style={{ color: theme.inkSoft }}>
                {page === "dashboard" && "Stock health at a glance"}
                {page === "inventory" &&
                  `${filteredMedicines.length} of ${medicines.length} items`}
                {page === "add" && "Stored directly to your inventory"}
{page === "dailySell" &&
                  `Today's sales: Rs${todaySalesAmount.toFixed(2)} (${todaySalesCount} transactions)`}
              </p>
            </div>
            <button
              onClick={() => setDark((d) => !d)}
              className="ml-auto flex items-center justify-center rounded-full"
              style={{
                width: 36,
                height: 36,
                backgroundColor: theme.card,
                border: `1px solid ${theme.line}`,
              }}
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </header>

          <main className="p-5 space-y-6">
            {/* Firebase Not Configured Banner */}
            {!isFirebaseConfigured && (
              <div
                className="rounded-lg px-4 py-3 text-sm flex items-center gap-3"
                style={{ backgroundColor: palette.amberSoft, color: "#8A5D1B" }}
              >
                <Database size={18} />
                <span>
                  <strong>Firebase not configured.</strong> Add your Firebase
                  credentials to{" "}
                  <code className="font-mono font-bold">.env.local</code> to
                  enable data persistence.
                </span>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2
                    size={32}
                    className="animate-spin"
                    style={{ color: palette.mintDeep }}
                  />
                  <p
                    className="text-sm font-medium"
                    style={{ color: theme.inkSoft }}
                  >
                    Loading inventory from Firestore...
                  </p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div
                className="rounded-lg px-4 py-3 text-sm flex items-center gap-3"
                style={{ backgroundColor: palette.redSoft, color: "#8C332A" }}
              >
                <CircleAlert size={18} />
                <span>{error}</span>
                <button
                  onClick={fetchMedicines}
                  className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: "#fff", color: palette.ink }}
                >
                  <RefreshCw size={12} />
                  Retry
                </button>
              </div>
            )}

            {/* Dashboard View */}
            {page === "dashboard" && !loading && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <StatCard
                    icon={Boxes}
                    label="Total Medicines"
                    value={stats.total}
                    tone="mint"
                  />
                  <StatCard
                    icon={AlertTriangle}
                    label="Low Stock"
                    value={stats.low}
                    tone="amber"
                  />
                  <StatCard
                    icon={CircleAlert}
                    label="Expired"
                    value={stats.expired}
                    tone="red"
                  />
                  <StatCard
                    icon={Package}
                    label="Categories"
                    value={stats.categories}
                    tone="ink"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  <StatCard
                    icon={Receipt}
                    label="Total Sale"
                    value={<span>Rs{profitLoss.revenue.toFixed(2)}</span>}
                    tone="mint"
                  />
                  <StatCard
                    icon={ShoppingCart}
                    label="Total Buying"
                    value={<span>Rs{profitLoss.cost.toFixed(2)}</span>}
                    tone="ink"
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="Total Profit / Loss"
                    value={
                      <span
                        style={{
                          color:
                            profitLoss.profit >= 0
                              ? palette.mintDeep
                              : palette.red,
                        }}
                      >
                        {profitLoss.profit >= 0 ? "+" : ""}Rs
                        {profitLoss.profit.toFixed(2)}
                      </span>
                    }
                    tone={profitLoss.profit >= 0 ? "mint" : "red"}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <StatCard
                    icon={ShoppingCart}
                    label="Total Stock Buying Price"
                    value={<span>Rs{stats.buyingValue.toFixed(2)}</span>}
                    tone="ink"
                  />
                  <StatCard
                    icon={Receipt}
                    label="Total Stock Selling Price"
                    value={<span>Rs{stats.sellingValue.toFixed(2)}</span>}
                    tone="mint"
                  />
                </div>

                {medicines.length > 0 && (
                  <>
                    <div className="grid lg:grid-cols-3 gap-4">
                      <LabelCard className="lg:col-span-2">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp
                            size={16}
                            style={{ color: palette.mintDeep }}
                          />
                          <h2 className="font-semibold font-space">
                            Stock by Category
                          </h2>
                        </div>
                        <div style={{ width: "100%", height: 260 }}>
                          <ResponsiveContainer>
                            <BarChart data={stockByCategory}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={theme.line}
                              />
                              <XAxis
                                dataKey="category"
                                tick={{ fontSize: 12, fill: theme.inkSoft }}
                              />
                              <YAxis
                                tick={{ fontSize: 12, fill: theme.inkSoft }}
                              />
                              <Tooltip
                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                              />
                              <Bar
                                dataKey="quantity"
                                fill={palette.mintDeep}
                                radius={[6, 6, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </LabelCard>

                      <LabelCard>
                        <div className="flex items-center gap-2 mb-3">
                          <CalendarClock
                            size={16}
                            style={{ color: palette.amber }}
                          />
                          <h2 className="font-semibold font-space">
                            Expiry Status
                          </h2>
                        </div>
                        <div style={{ width: "100%", height: 220 }}>
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie
                                data={expiryBreakdown}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={45}
                                outerRadius={75}
                                paddingAngle={3}
                              >
                                {expiryBreakdown.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Pie>
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Tooltip
                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </LabelCard>
                    </div>

<div className="grid lg:grid-cols-2 gap-4">
                      <LabelCard>
                        <h2 className="font-semibold mb-3 font-space">
                          Recent Medicines
                        </h2>
                        <div className="space-y-2 max-h-80 overflow-y-auto op-scroll pr-1">
                          {recentMedicines.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between text-sm py-1.5"
                              style={{
                                borderBottom: `1px solid ${theme.line}`,
                              }}
                            >
                              <div>
                                <div className="font-medium">{m.name}</div>
                                <div
                                  className="text-xs font-mono"
                                  style={{ color: theme.inkSoft }}
                                >
                                  {m.batchNo}
                                </div>
                              </div>
                              <Pill tone="mint">{m.quantity} in stock</Pill>
                            </div>
                          ))}
                        </div>
                      </LabelCard>

                      <LabelCard>
                        <h2 className="font-semibold mb-3 font-space">
                          Low Stock Medicines
                        </h2>
                        {lowStockList.length === 0 ? (
                          <p
                            className="text-sm"
                            style={{ color: theme.inkSoft }}
                          >
                            Nothing running low right now.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-80 overflow-y-auto op-scroll pr-1">
                            {lowStockList.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between text-sm py-1.5"
                                style={{
                                  borderBottom: `1px solid ${theme.line}`,
                                }}
                              >
                                <div className="font-medium">{m.name}</div>
                                <Pill tone="amber">{m.quantity} left</Pill>
                              </div>
                            ))}
                          </div>
                        )}
                      </LabelCard>
                    </div>

                    <LabelCard>
                      <div className="flex items-center gap-2 mb-3">
                        <CalendarClock
                          size={16}
                          style={{ color: palette.red }}
                        />
                        <h2 className="font-semibold font-space">
                          Expiring / Expired Medicines
                        </h2>
                      </div>
                      {expiringMedicines.length === 0 ? (
                        <p
                          className="text-sm"
                          style={{ color: theme.inkSoft }}
                        >
                          No medicines are expired or expiring soon.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto op-scroll pr-1">
                          {expiringMedicines.map((m) => {
                            const status = expiryStatus(m.expiryDate);
                            return (
                              <div
                                key={m.id}
                                className="flex items-center justify-between text-sm py-1.5"
                                style={{
                                  borderBottom: `1px solid ${theme.line}`,
                                }}
                              >
                                <div>
                                  <div className="font-medium">{m.name}</div>
                                  <div
                                    className="text-xs font-mono"
                                    style={{ color: theme.inkSoft }}
                                  >
                                    Expires {m.expiryDate}
                                  </div>
                                </div>
                                <Pill tone={status === "expired" ? "red" : "amber"}>
                                  {status === "expired"
                                    ? "Expired"
                                    : `${daysUntil(m.expiryDate)} days left`}
                                </Pill>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </LabelCard>
                  </>
                )}

                {medicines.length === 0 && isFirebaseConfigured && !error && (
                  <div className="text-center py-12">
                    <Package
                      size={40}
                      className="mx-auto mb-3"
                      style={{ color: theme.inkSoft }}
                    />
                    <p className="font-medium" style={{ color: theme.inkSoft }}>
                      No medicines in inventory yet.
                    </p>
                    <button
                      onClick={() => {
                        setPage("add");
                        setDraft(emptyDraft());
                        setSuccessMessage("");
                      }}
                      className="mt-3 px-4 py-2 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: palette.mintDeep,
                        color: "#fff",
                      }}
                    >
                      Add your first medicine
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Inventory Table */}
            {page === "inventory" && !loading && (
              <LabelCard>
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div
                    className="flex items-center gap-2 flex-1 px-3 py-2 rounded-full"
                    style={{
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.line}`,
                    }}
                  >
                    <Search size={15} style={{ color: theme.inkSoft }} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or batch number"
                      className="bg-transparent outline-none text-sm flex-1"
                      style={{ color: theme.ink }}
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 rounded-full text-sm outline-none"
                    style={{
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.line}`,
                      color: theme.ink,
                    }}
                  >
                    <option>All</option>
                    {allCategoryOptions.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    onClick={fetchMedicines}
                    className="flex items-center gap-1 px-3 py-2 rounded-full text-sm"
                    style={{
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.line}`,
                      color: theme.ink,
                    }}
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>

<div className="overflow-x-auto op-scroll">
                  <div style={{ maxHeight: 560, overflowY: "auto" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="text-left sticky top-0 z-10"
                        style={{
                          color: theme.inkSoft,
                          backgroundColor: dark ? theme.card : "#fff",
                        }}
                      >
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Medicine
                        </th>
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Category
                        </th>
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Qty
                        </th>
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Buy Price
                        </th>
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Buy Disc
                        </th>
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Price
                        </th>
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Expiry
                        </th>
                        <th className="py-2 pr-4 font-mono text-xs uppercase font-medium">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMedicines.map((m) => {
                        const status = expiryStatus(m.expiryDate);
                        return (
                          <tr
                            key={m.id}
                            style={{ borderTop: `1px solid ${theme.line}` }}
                          >
                            <td className="py-2.5 pr-4">
                              <div className="font-medium">{m.name}</div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: theme.inkSoft }}
                              >
                                {m.batchNo}
                              </div>
                            </td>
                            <td className="py-2.5 pr-4">{m.category}</td>
                            <td className="py-2.5 pr-4">
                              {m.quantity <= LOW_STOCK_THRESHOLD ? (
                                <Pill tone="amber">{m.quantity}</Pill>
                              ) : (
                                m.quantity
                              )}
                            </td>
                            <td className="py-2.5 pr-4">
                              {m.buyingDiscount > 0 ? (
                                <>
                                  <span
                                    style={{
                                      color: theme.inkSoft,
                                      textDecoration: "line-through",
                                    }}
                                  >
                                    {m.purchasePrice.toFixed(2)}
                                  </span>{" "}
                                  <span
                                    className="font-semibold"
                                    style={{ color: palette.mintDeeper }}
                                  >
                                    {effectiveCost(
                                      m.purchasePrice,
                                      m.buyingDiscount,
                                    ).toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                m.purchasePrice.toFixed(2)
                              )}
                            </td>
                            <td className="py-2.5 pr-4">
                              {m.buyingDiscount > 0 ? (
                                <Pill tone="mint">{m.buyingDiscount}%</Pill>
                              ) : (
                                <span style={{ color: theme.inkSoft }}>-</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4">
                              Pkr {m.sellingPrice.toFixed(2)}
                            </td>
                            <td className="py-2.5 pr-4">
                              {status === "expired" && (
                                <Pill tone="red">{m.expiryDate}</Pill>
                              )}
                              {status === "soon" && (
                                <Pill tone="amber">{m.expiryDate}</Pill>
                              )}
                              {status === "fresh" && (
                                <span>{m.expiryDate}</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => startEdit(m)}
                                  className="p-1.5 rounded-full"
                                  style={{
                                    backgroundColor: palette.mint,
                                    color: palette.mintDeeper,
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => removeMedicine(m.id)}
                                  className="p-1.5 rounded-full"
                                  style={{
                                    backgroundColor: palette.redSoft,
                                    color: "#8C332A",
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
{filteredMedicines.length === 0 && (
                        <tr>
                          <td
                            colSpan={8}
                            className="py-6 text-center text-sm"
                            style={{ color: theme.inkSoft }}
                          >
                            {medicines.length === 0
                              ? "No medicines in inventory yet."
                              : "No medicines match your search."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </LabelCard>
            )}

            {/* Form View */}
            {page === "add" && !loading && (
              <LabelCard className="max-w-full">
                <form
                  onSubmit={saveDraft}
                  className="grid sm:grid-cols-2 gap-4"
                >
                  <Field
                    label="Medicine Name"
                    value={draft.name}
                    onChange={(v: string) =>
                      setDraft({ ...draft, name: v.toUpperCase() })
                    }
                  />
                  <div>
                    <label
                      className="text-xs font-mono uppercase"
                      style={{ color: theme.inkSoft }}
                    >
                      Category
                    </label>
                    <select
                      value={draft.category}
                      onChange={(e) =>
                        setDraft({ ...draft, category: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1px solid ${theme.line}`,
                        color: theme.ink,
                      }}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value={CUSTOM_CATEGORY}>Custom...</option>
                    </select>
                    {draft.category === CUSTOM_CATEGORY && (
                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="e.g. Beauty Cream"
                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                          backgroundColor: theme.bg,
                          border: `1px solid ${theme.line}`,
                          color: theme.ink,
                        }}
                      />
                    )}
                  </div>
                  <Field
                    label="Batch Number"
                    value={draft.batchNo}
                    onChange={(v: string) =>
                      setDraft({ ...draft, batchNo: v.toUpperCase() })
                    }
                    mono
                  />
                  <Field
                    label="Quantity"
                    type="number"
                    value={draft.quantity}
                    onChange={(v: string) =>
                      setDraft({ ...draft, quantity: v })
                    }
                  />
                  <Field
                    label="Buying Price"
                    type="number"
                    value={draft.purchasePrice}
                    onChange={(v: string) =>
                      setDraft({ ...draft, purchasePrice: v })
                    }
                  />
                  <Field
                    label="Selling Price"
                    type="number"
                    value={draft.sellingPrice}
                    onChange={(v: string) =>
                      setDraft({ ...draft, sellingPrice: v })
                    }
                  />
                  <div>
                    <Field
                      label="Buying Discount (%)"
                      type="number"
                      value={draft.buyingDiscount}
                      onChange={(v: string) =>
                        setDraft({ ...draft, buyingDiscount: v })
                      }
                    />
                    {Number(draft.purchasePrice) > 0 &&
                      Number(draft.buyingDiscount) > 0 && (
                        <div
                          className="mt-2 px-3 py-2 rounded-lg text-xs font-mono"
                          style={{
                            backgroundColor: palette.mint,
                            color: palette.mintDeeper,
                          }}
                        >
                          Buying Rate after Discount:{" "}
                          <strong>
                            {effectiveCost(
                              Number(draft.purchasePrice),
                              Number(draft.buyingDiscount),
                            ).toFixed(2)}
                          </strong>
                        </div>
                      )}
                  </div>
                  <Field
                    label="Supplier"
                    value={draft.supplier}
                    onChange={(v: string) =>
                      setDraft({ ...draft, supplier: v })
                    }
                  />
                  <Field
                    label="Expiry Date"
                    type="date"
                    value={draft.expiryDate}
                    onChange={(v: string) =>
                      setDraft({ ...draft, expiryDate: v })
                    }
                  />

                  {successMessage && (
                    <div
                      className="sm:col-span-2 text-sm px-3 py-2 rounded-lg"
                      style={{
                        backgroundColor: palette.mint,
                        color: palette.mintDeeper,
                      }}
                    >
                      {successMessage}
                    </div>
                  )}

                  {formError && (
                    <div
                      className="sm:col-span-2 text-sm px-3 py-2 rounded-lg"
                      style={{
                        backgroundColor: palette.redSoft,
                        color: "#8C332A",
                      }}
                    >
                      {formError}
                    </div>
                  )}

                  <div className="sm:col-span-2 flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                      style={{
                        backgroundColor: palette.mintDeep,
                        color: "#fff",
                      }}
                    >
                      {saving && <Loader2 size={16} className="animate-spin" />}
                      {saving
                        ? "Saving..."
                        : draft.id
                          ? "Save Changes"
                          : "Save Medicine"}
                    </button>
                    {draft.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(emptyDraft());
                          setFormError("");
                          setSuccessMessage("");
                        }}
                        className="px-5 py-2.5 rounded-full text-sm font-semibold"
                        style={{
                          backgroundColor: theme.bg,
                          border: `1px solid ${theme.line}`,
                          color: theme.ink,
                        }}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>
              </LabelCard>
            )}

            {/* Daily Sell View */}
            {page === "dailySell" && !loading && (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* ── Cart / Bulk Sell Form ── */}
                <LabelCard>
                  <div className="flex items-center gap-2 mb-4">
                    <ShoppingCart
                      size={18}
                      style={{ color: palette.mintDeep }}
                    />
                    <h2 className="font-semibold font-space">
                      New Sale (Bulk)
                    </h2>
                  </div>

                  {sellSuccess && (
                    <div
                      className="mb-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                      style={{
                        backgroundColor: palette.mint,
                        color: palette.mintDeeper,
                      }}
                    >
                      <RotateCcw size={14} />
                      {sellSuccess}
                    </div>
                  )}

                  {/* Add to Cart Row */}
                  <div
                    className="space-y-3 mb-4 p-3 rounded-lg"
                    style={{
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.line}`,
                    }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
<div className="sm:col-span-1">
                        <label
                          className="text-xs font-mono uppercase"
                          style={{ color: palette.inkSoft }}
                        >
                          Medicine
                        </label>
                        <div className="relative mt-1" ref={cartSearchRef}>
                          {/* Selected medicine display */}
                          <button
                            type="button"
                            onClick={() => {
                              setCartOpen((o) => !o);
                              setCartSearch("");
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm outline-none"
                            style={{
                              backgroundColor: theme.bg,
                              border: `1px solid ${theme.line}`,
                              color: theme.ink,
                            }}
                          >
                            <Search size={15} style={{ color: theme.inkSoft }} />
                            <span className="flex-1 min-w-0 text-left truncate">
                              {cartMedicineId
                                ? (() => {
                                    const sel = medicines.find(
                                      (m) => m.id === cartMedicineId,
                                    );
                                    return sel
                                      ? `${sel.name} (Stock: ${sel.quantity})`
                                      : "-- Select --";
                                  })()
                                : "-- Select --"}
                            </span>
                            <span
                              style={{ color: theme.inkSoft }}
                              className="text-xs"
                            >
                              {cartOpen ? "▲" : "▼"}
                            </span>
                          </button>

                          {/* Dropdown */}
                          {cartOpen && (
                            <div
                              className="absolute z-30 mt-1 w-full rounded-lg shadow-lg overflow-hidden"
                              style={{
                                backgroundColor: "#fff",
                                border: `1px solid ${theme.line}`,
                              }}
                            >
                              {/* Search input */}
                              <div
                                className="flex items-center gap-2 px-3 py-2"
                                style={{
                                  borderBottom: `1px solid ${theme.line}`,
                                  backgroundColor: theme.bg,
                                }}
                              >
                                <Search
                                  size={14}
                                  style={{ color: theme.inkSoft }}
                                />
                                <input
                                  value={cartSearch}
                                  onChange={(e) =>
                                    setCartSearch(e.target.value)
                                  }
                                  placeholder="Type to search medicine..."
                                  autoFocus
                                  className="bg-transparent outline-none text-sm flex-1 min-w-0"
                                  style={{ color: theme.ink }}
                                />
                              </div>

                              {/* Results */}
                              <div
                                className="max-h-56 overflow-y-auto op-scroll"
                                style={{ backgroundColor: "#fff" }}
                              >
                                {cartFilteredMedicines.length === 0 ? (
                                  <div
                                    className="px-3 py-3 text-sm"
                                    style={{ color: theme.inkSoft }}
                                  >
                                    No medicines match "{cartSearch}".
                                  </div>
                                ) : (
                                  cartFilteredMedicines.map((m) => {
                                    const selected =
                                      m.id === cartMedicineId;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => {
                                          setCartMedicineId(m.id);
                                          setCartOpen(false);
                                          setCartSearch("");
                                        }}
                                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#F1ECDF]"
                                        style={{
                                          backgroundColor: selected
                                            ? palette.mint
                                            : "transparent",
                                          color: theme.ink,
                                          borderBottom: `1px solid ${theme.line}`,
                                        }}
                                      >
                                        <span className="min-w-0">
                                          <span className="block font-medium truncate">
                                            {m.name}
                                          </span>
                                          <span
                                            className="block text-xs font-mono"
                                            style={{ color: theme.inkSoft }}
                                          >
                                            Batch: {m.batchNo}
                                          </span>
                                        </span>
                                        <span
                                          className="flex-shrink-0 text-xs font-semibold"
                                          style={{ color: palette.mintDeeper }}
                                        >
                                          Stock: {m.quantity}
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label
                          className="text-xs font-mono uppercase"
                          style={{ color: palette.inkSoft }}
                        >
                          Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={cartQuantity}
                          onChange={(e) => setCartQuantity(e.target.value)}
                          className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                          style={{
                            backgroundColor: theme.bg,
                            border: `1px solid ${theme.line}`,
                            color: theme.ink,
                          }}
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleAddToCart}
                          className="w-full px-4 py-2 rounded-full text-sm font-semibold flex items-center justify-center gap-2"
                          style={{
                            backgroundColor: palette.mintDeep,
                            color: "#fff",
                          }}
                        >
                          <PlusCircle size={15} />
                          Add to Cart
                        </button>
                      </div>
                    </div>

                    {cartMedicineId &&
                      (() => {
                        const med = medicines.find(
                          (m) => m.id === cartMedicineId,
                        );
                        return med ? (
                          <div
                            className="text-xs"
                            style={{ color: palette.inkSoft }}
                          >
                            Price: ${med.sellingPrice.toFixed(2)} / unit
                            &middot; Available: {med.quantity}
                          </div>
                        ) : null;
                      })()}
                  </div>

                  {/* Cart Table */}
                  {cartItems.length > 0 && (
                    <div className="mb-4">
                      <div
                        className="text-xs font-mono uppercase mb-2"
                        style={{ color: palette.inkSoft }}
                      >
                        Cart ({cartItems.length} items)
                      </div>
                      <div className="space-y-2">
                        {cartItems.map((item) => (
                          <div
                            key={item.medicineId}
                            className="flex items-center justify-between p-2 rounded-lg text-sm"
                            style={{
                              backgroundColor: theme.bg,
                              border: `1px solid ${theme.line}`,
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                {item.medicineName}
                              </div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: theme.inkSoft }}
                              >
                                {item.quantity} × ${item.unitPrice.toFixed(2)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span
                                className="font-mono font-bold text-sm"
                                style={{ color: palette.mintDeep }}
                              >
                                ${item.totalPrice.toFixed(2)}
                              </span>
                              <button
                                onClick={() =>
                                  handleRemoveCartItem(item.medicineId)
                                }
                                className="p-1 rounded-full"
                                style={{
                                  backgroundColor: palette.redSoft,
                                  color: "#8C332A",
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Discount control */}
                        <div
                          className="flex items-center gap-2 p-2 rounded-lg text-sm"
                          style={{
                            backgroundColor: theme.bg,
                            border: `1px solid ${theme.line}`,
                          }}
                        >
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setCartDiscountType("percent")}
                              className="px-2 py-1 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor:
                                  cartDiscountType === "percent"
                                    ? palette.mintDeep
                                    : "transparent",
                                color:
                                  cartDiscountType === "percent"
                                    ? "#fff"
                                    : theme.inkSoft,
                                border: `1px solid ${cartDiscountType === "percent" ? palette.mintDeep : theme.line}`,
                              }}
                            >
                              %
                            </button>
                            <button
                              type="button"
                              onClick={() => setCartDiscountType("amount")}
                              className="px-2 py-1 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor:
                                  cartDiscountType === "amount"
                                    ? palette.mintDeep
                                    : "transparent",
                                color:
                                  cartDiscountType === "amount"
                                    ? "#fff"
                                    : theme.inkSoft,
                                border: `1px solid ${cartDiscountType === "amount" ? palette.mintDeep : theme.line}`,
                              }}
                            >
                              Rs
                            </button>
                          </div>
                          <input
                            type="number"
                            min="0"
                            value={cartDiscount}
                            onChange={(e) => setCartDiscount(e.target.value)}
                            placeholder={
                              cartDiscountType === "percent"
                                ? "Customer Discount % (optional)"
                                : "Customer Discount Rs (optional)"
                            }
                            className="flex-1 bg-transparent outline-none text-sm font-mono min-w-0"
                            style={{ color: theme.ink }}
                          />
                          {cartDiscountAmount > 0 && (
                            <button
                              type="button"
                              onClick={() => setCartDiscount("")}
                              className="p-0.5 rounded-full flex-shrink-0"
                              style={{ color: theme.inkSoft }}
                              title="Clear discount"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        {/* Cart Totals */}
                        <div className="space-y-1 pt-1">
                          <div
                            className="flex items-center justify-between px-2 text-sm"
                            style={{ color: theme.inkSoft }}
                          >
                            <span>Subtotal</span>
                            <span className="font-mono">
                              ${cartSubtotal.toFixed(2)}
                            </span>
                          </div>
                          {cartDiscountAmount > 0 && (
                            <div
                              className="flex items-center justify-between px-2 text-sm font-semibold"
                              style={{ color: palette.red }}
                            >
                              <span>
                                Discount (
                                {cartDiscountType === "percent"
                                  ? `${Number(cartDiscount) || 0}%`
                                  : "Rs"}
                                )
                              </span>
                              <span className="font-mono">
                                -${cartDiscountAmount.toFixed(2)}
                              </span>
                            </div>
                          )}
                          <div
                            className="flex items-center justify-between p-2 rounded-lg text-sm font-bold"
                            style={{
                              backgroundColor: palette.mint,
                              color: palette.mintDeeper,
                            }}
                          >
                            <span>Grand Total</span>
                            <span className="font-mono">
                              ${cartGrandTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Customer Name + Complete Sale */}
                  <div className="space-y-3">
                    <Field
                      label="Customer Name"
                      value={cartCustomerName}
                      onChange={(v) => setCartCustomerName(v)}
                      placeholder="Walk-in Customer"
                    />

                    {cartError && (
                      <div
                        className="text-sm px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: palette.redSoft,
                          color: "#8C332A",
                        }}
                      >
                        {cartError}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleBulkSell}
                      disabled={processingSale || cartItems.length === 0}
                      className="w-full px-5 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{
                        backgroundColor: palette.mintDeep,
                        color: "#fff",
                      }}
                    >
                      {processingSale ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />{" "}
                          Processing...
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={16} /> Complete Sale (
                          {cartItems.length} items)
                        </>
                      )}
                    </button>
                  </div>
                </LabelCard>

                {/* ── Sales History & Returns ── */}
                <LabelCard>
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt size={18} style={{ color: palette.mintDeep }} />
                    <h2 className="font-semibold font-space">{`Sales History`}</h2>
                    <button
                      onClick={() => {
                        fetchMedicines();
                        fetchSales();
                      }}
                      className="ml-auto p-1.5 rounded-full"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1px solid ${theme.line}`,
                      }}
                      title="Refresh"
                    >
                      <RefreshCw size={14} />
                    </button>
                    {/* {sales.length > 0 && (
                      <button
                        onClick={handleClearAllSales}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold"
                        style={{
                          backgroundColor: palette.redSoft,
                          color: "#8C332A",
                        }}
                        title="Clear all sales history"
                      >
                        <Trash2 size={12} />
                        Clear All
                      </button>
                    )} */}
                  </div>

                  {saleHistorySuccess && (
                    <div
                      className="mb-3 px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: palette.mint,
                        color: palette.mintDeeper,
                      }}
                    >
                      {saleHistorySuccess}
                    </div>
                  )}
                  {saleHistoryError && (
                    <div
                      className="mb-3 px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: palette.redSoft,
                        color: "#8C332A",
                      }}
                    >
                      {saleHistoryError}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 mb-4">
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-full"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1px solid ${theme.line}`,
                      }}
                    >
                      <Search size={15} style={{ color: theme.inkSoft }} />
                      <input
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search by customer name..."
                        className="bg-transparent outline-none text-sm flex-1"
                        style={{ color: theme.ink }}
                      />
                      {customerSearch && (
                        <button
                          onClick={() => setCustomerSearch("")}
                          className="p-0.5 rounded-full"
                          style={{ color: theme.inkSoft }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="date"
                        value={saleFromDate}
                        onChange={(e) => setSaleFromDate(e.target.value)}
                        className="px-3 py-2 rounded-full text-sm outline-none"
                        style={{
                          backgroundColor: theme.bg,
                          border: `1px solid ${theme.line}`,
                          color: theme.ink,
                        }}
                      />
                      <input
                        type="date"
                        value={saleToDate}
                        onChange={(e) => setSaleToDate(e.target.value)}
                        className="px-3 py-2 rounded-full text-sm outline-none"
                        style={{
                          backgroundColor: theme.bg,
                          border: `1px solid ${theme.line}`,
                          color: theme.ink,
                        }}
                      />
                      {(saleFromDate || saleToDate || customerSearch) && (
                        <button
                          onClick={() => {
                            setCustomerSearch("");
                            setSaleFromDate("");
                            setSaleToDate("");
                          }}
                          className="px-3 py-2 rounded-full text-sm font-semibold"
                          style={{
                            backgroundColor: palette.amberSoft,
                            color: "#8A5D1B",
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const filteredSales = sales.filter((s) => {
                      const matchesCustomer =
                        !customerSearch.trim() ||
                        s.customerName
                          .toLowerCase()
                          .includes(customerSearch.toLowerCase());
                      const saleDate = new Date(s.date);
                      const from = saleFromDate
                        ? new Date(`${saleFromDate}T00:00:00`)
                        : null;
                      const to = saleToDate
                        ? new Date(`${saleToDate}T23:59:59`)
                        : null;
                      const matchesRange =
                        (!from || saleDate >= from) && (!to || saleDate <= to);
                      return matchesCustomer && matchesRange;
                    });

                    return filteredSales.length === 0 ? (
                      <div className="text-center py-8">
                        <ShoppingCart
                          size={32}
                          className="mx-auto mb-2"
                          style={{ color: theme.inkSoft }}
                        />
                        <p className="text-sm" style={{ color: theme.inkSoft }}>
                          {customerSearch
                            ? "No sales match this customer."
                            : "No sales recorded yet."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto op-scroll pr-1">
                        {filteredSales.map((sale) => {
                          const returned = sale.returnedQuantity || 0;
                          const canReturn = sale.quantitySold - returned > 0;
                          const items =
                            sale.items && sale.items.length > 0
                              ? sale.items
                              : null;
                          return (
                            <div
                              key={sale.id}
                              className="p-3 rounded-lg text-sm"
                              style={{
                                backgroundColor: theme.bg,
                                border: `1px solid ${theme.line}`,
                              }}
                            >
                              {/* Items summary */}
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">
                                  {items
                                    ? `${items.length} items`
                                    : sale.medicineName}
                                </span>
                                <span
                                  className="font-mono text-xs"
                                  style={{ color: theme.inkSoft }}
                                >
                                  {new Date(sale.date).toLocaleTimeString()}
                                </span>
                              </div>

                              {items ? (
                                <div className="space-y-1 mb-1">
                                  {items.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex justify-between text-xs"
                                      style={{ color: theme.inkSoft }}
                                    >
                                      <span>
                                        {item.medicineName} × {item.quantity}
                                      </span>
                                      <span>${item.totalPrice.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <span style={{ color: theme.inkSoft }}>
                                    Qty: <strong>{sale.quantitySold}</strong> ×
                                    ${sale.unitPrice.toFixed(2)}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center justify-between mt-1">
                                <span
                                  className="text-xs"
                                  style={{ color: theme.inkSoft }}
                                >
                                  <span
                                    className="font-mono font-bold"
                                    style={{ color: palette.mintDeep }}
                                  >
                                    Total:{sale.totalPrice.toFixed(2)}Pkr
                                  </span>
                                  <span className="ml-2">
                                    <User size={12} className="inline mr-1" />
                                    {sale.customerName}
                                  </span>
                                  {returned > 0 && (
                                    <span
                                      className="ml-2"
                                      style={{ color: palette.amber }}
                                    >
                                      (Returned: {returned})
                                    </span>
                                  )}
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setLastSale(sale);
                                      setShowReceipt(true);
                                    }}
                                    className="p-1.5 rounded-full"
                                    style={{
                                      backgroundColor: palette.mint,
                                      color: palette.mintDeeper,
                                    }}
                                    title="View Receipt"
                                  >
                                    <Download size={12} />
                                  </button>
                                  {canReturn && (
                                    <button
                                      onClick={() =>
                                        setReturningSale(
                                          returningSale === sale.id
                                            ? null
                                            : sale.id,
                                        )
                                      }
                                      className="p-1.5 rounded-full"
                                      style={{
                                        backgroundColor: palette.amberSoft,
                                        color: "#8A5D1B",
                                      }}
                                      title="Return Item"
                                    >
                                      <RotateCcw size={12} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setConfirmDeleteSaleId(sale.id);
                                      setSaleHistoryError("");
                                      setSaleHistorySuccess("");
                                    }}
                                    className="p-1.5 rounded-full"
                                    style={{
                                      backgroundColor: palette.redSoft,
                                      color: "#8C332A",
                                    }}
                                    title="Delete Sale Record"
                                    disabled={deletingSaleId === sale.id}
                                  >
                                    {deletingSaleId === sale.id ? (
                                      <Loader2
                                        size={12}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Trash2 size={12} />
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Return Input */}
                              {returningSale === sale.id && (
                                <div
                                  className="mt-2 pt-2 space-y-2"
                                  style={{
                                    borderTop: `1px solid ${theme.line}`,
                                  }}
                                >
                                  {/* For multi-item sales, show an item selector */}
                                  {items && items.length > 1 && (
                                    <div className="flex items-center gap-2">
                                      <label
                                        className="text-xs font-mono"
                                        style={{ color: palette.inkSoft }}
                                      >
                                        Select item:
                                      </label>
                                      <select
                                        value={returningMedicineId}
                                        onChange={(e) => {
                                          setReturningMedicineId(
                                            e.target.value,
                                          );
                                          setReturnQty("1");
                                        }}
                                        className="flex-1 px-2 py-1 rounded text-sm outline-none font-mono"
                                        style={{
                                          backgroundColor: theme.bg,
                                          border: `1px solid ${theme.line}`,
                                          color: theme.ink,
                                        }}
                                      >
                                        <option value="">-- Choose --</option>
                                        {items.map((item, idx) => {
                                          const itemReturned =
                                            item.returnedQuantity || 0;
                                          const itemMax =
                                            item.quantity - itemReturned;
                                          return itemMax > 0 ? (
                                            <option
                                              key={item.medicineId}
                                              value={item.medicineId}
                                            >
                                              {item.medicineName} (max {itemMax}
                                              )
                                            </option>
                                          ) : null;
                                        })}
                                      </select>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    <MinusCircle
                                      size={14}
                                      style={{ color: palette.amber }}
                                    />
                                    <input
                                      type="number"
                                      min="1"
                                      max={
                                        items &&
                                        items.length > 1 &&
                                        returningMedicineId
                                          ? (items.find(
                                              (i) =>
                                                i.medicineId ===
                                                returningMedicineId,
                                            )?.quantity || 0) -
                                            (items.find(
                                              (i) =>
                                                i.medicineId ===
                                                returningMedicineId,
                                            )?.returnedQuantity || 0)
                                          : sale.quantitySold - returned
                                      }
                                      value={returnQty}
                                      onChange={(e) =>
                                        setReturnQty(e.target.value)
                                      }
                                      className="w-16 px-2 py-1 rounded text-sm outline-none font-mono"
                                      style={{
                                        backgroundColor: theme.bg,
                                        border: `1px solid ${theme.line}`,
                                        color: theme.ink,
                                      }}
                                    />
                                    <span
                                      className="text-xs"
                                      style={{ color: theme.inkSoft }}
                                    >
                                      (max{" "}
                                      {items &&
                                      items.length > 1 &&
                                      returningMedicineId
                                        ? (items.find(
                                            (i) =>
                                              i.medicineId ===
                                              returningMedicineId,
                                          )?.quantity || 0) -
                                          (items.find(
                                            (i) =>
                                              i.medicineId ===
                                              returningMedicineId,
                                          )?.returnedQuantity || 0)
                                        : sale.quantitySold - returned}
                                      )
                                    </span>
                                    <button
                                      onClick={() => {
                                        const medId =
                                          items && items.length > 1
                                            ? returningMedicineId
                                            : undefined;
                                        if (
                                          items &&
                                          items.length > 1 &&
                                          !medId
                                        ) {
                                          setSellError(
                                            "Please select an item to return.",
                                          );
                                          return;
                                        }
                                        handleReturn(sale.id, medId);
                                      }}
                                      disabled={processingSale}
                                      className="ml-auto px-3 py-1 rounded-full text-xs font-semibold disabled:opacity-60"
                                      style={{
                                        backgroundColor: palette.mintDeep,
                                        color: "#fff",
                                      }}
                                    >
                                      {processingSale ? "..." : "Return"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </LabelCard>
              </div>
            )}

            {/* Receipt Modal */}
            {showReceipt && lastSale && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={() => setShowReceipt(false)}
              >
                <div
                  className="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
                  style={{
                    backgroundColor: "#fff",
                    border: `1px solid ${palette.line}`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Receipt Content */}
                  <div id="receipt-content" className="text-center">
                    <div className="mb-3">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Cross size={16} color={palette.mintDeep} />
                        <span
                          className="font-bold font-space text-lg"
                          style={{ color: palette.ink }}
                        >
                          Brothers
                        </span>
                      </div>
                      <div
                        className="text-xs font-mono"
                        style={{ color: palette.inkSoft }}
                      >
                        Sales Receipt
                      </div>
                      <div
                        className="h-px my-3"
                        style={{ backgroundColor: palette.line }}
                      />
                    </div>

                    <table className="w-full text-sm mb-3">
                      <tbody>
                        <tr>
                          <td
                            className="py-1 text-left font-mono text-xs"
                            style={{ color: palette.inkSoft }}
                          >
                            Date
                          </td>
                          <td className="py-1 text-right font-mono">
                            {new Date(lastSale.date).toLocaleDateString()}
                          </td>
                        </tr>
                        <tr>
                          <td
                            className="py-1 text-left font-mono text-xs"
                            style={{ color: palette.inkSoft }}
                          >
                            Time
                          </td>
                          <td className="py-1 text-right font-mono">
                            {new Date(lastSale.date).toLocaleTimeString()}
                          </td>
                        </tr>
                        <tr>
                          <td
                            className="py-1 text-left font-mono text-xs"
                            style={{ color: palette.inkSoft }}
                          >
                            Customer
                          </td>
                          <td className="py-1 text-right font-mono">
                            {lastSale.customerName}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Items Table */}
                    <div
                      className="h-px my-2"
                      style={{ backgroundColor: palette.line }}
                    />
                    <table className="w-full text-sm mb-3">
                      <thead>
                        <tr
                          className="text-left text-xs font-mono uppercase"
                          style={{ color: palette.inkSoft }}
                        >
                          <th className="pb-1 pr-2">Item</th>
                          <th className="pb-1 pr-2">Qty</th>
                          <th className="pb-1 pr-2">Price</th>
                          <th className="pb-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(lastSale.items && lastSale.items.length > 0
                          ? lastSale.items
                          : [
                              {
                                medicineName: lastSale.medicineName,
                                quantity: lastSale.quantitySold,
                                unitPrice: lastSale.unitPrice,
                                totalPrice: lastSale.totalPrice,
                              } as CartItem,
                            ]
                        ).map((item, idx) => (
                          <tr key={idx}>
                            <td
                              className="py-1 pr-2 text-left text-xs"
                              style={{ color: palette.inkSoft }}
                            >
                              {item.medicineName}
                            </td>
                            <td className="py-1 pr-2 font-mono">
                              {item.quantity}
                            </td>
                            <td className="py-1 pr-2 font-mono">
                              Rs{item.unitPrice.toFixed(2)}
                            </td>
                            <td className="py-1 text-right font-mono">
                              Rs{item.totalPrice.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div
                      className="h-px my-2"
                      style={{ backgroundColor: palette.line }}
                    />
                    {(() => {
                      const receiptItems =
                        lastSale.items && lastSale.items.length > 0
                          ? lastSale.items
                          : [
                              {
                                medicineName: lastSale.medicineName,
                                quantity: lastSale.quantitySold,
                                unitPrice: lastSale.unitPrice,
                                totalPrice: lastSale.totalPrice,
                              } as CartItem,
                            ];
                      const receiptSubtotal = receiptItems.reduce(
                        (sum, item) => sum + item.totalPrice,
                        0,
                      );
                      const receiptDiscountAmount =
                        lastSale.discountAmount && lastSale.discountAmount > 0
                          ? lastSale.discountAmount
                          : 0;
                      const receiptGrandTotal = Math.max(
                        receiptSubtotal - receiptDiscountAmount,
                        0,
                      );

                      return (
                        <>
                          <div className="flex justify-between items-center mb-4">
                            <span
                              className="font-mono text-xs"
                              style={{ color: palette.inkSoft }}
                            >
                              Subtotal
                            </span>
                            <span className="font-mono">
                              Rs{receiptSubtotal.toFixed(2)}
                            </span>
                          </div>
                          {receiptDiscountAmount > 0 && (
                            <div className="flex justify-between items-center mb-2">
                              <span
                                className="font-mono text-xs"
                                style={{ color: palette.red }}
                              >
                                Customer Discount
                              </span>
                              <span
                                className="font-mono"
                                style={{ color: palette.red }}
                              >
                                -Rs{receiptDiscountAmount.toFixed(2)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-bold font-space">Total</span>
                            <span
                              className="font-bold font-space text-xl"
                              style={{ color: palette.mintDeep }}
                            >
                              Rs{receiptGrandTotal.toFixed(2)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                    <div
                      className="text-xs mb-4"
                      style={{ color: palette.inkSoft }}
                    >
                      Thank you for your purchase!
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        const printContent =
                          document.getElementById("receipt-content");
                        if (!printContent) return;
                        const win = window.open("", "_blank", "width=420,height=800");
                        if (!win) return;

                        const html = `
                          <!doctype html>
                          <html>
                            <head>
                              <meta charset="utf-8" />
                              <title>Sehat Diagnostic Receipt</title>
                              <style>
                                @page { size: 80mm auto; margin: 6mm; }
                                html,body { margin:0; padding:0; -webkit-print-color-adjust: exact; }
                                /* Force dark, bold text for thermal printers which often
                                   render light colors faintly. */
                                body, .receipt, .receipt * { color: #000 !important; font-weight: 700 !important; -webkit-print-color-adjust: exact; }
                                body { font-family: 'Courier New', monospace; font-size: 13px; line-height:1.2; }
                                .receipt { max-width: 320px; margin: 0 auto; padding: 4px; }
                                .center { text-align: center; }
                                table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                                th, td { padding: 3px 0; word-break: break-word; vertical-align: top; }
                                .item { width: 52%; text-align: left; }
                                .qty { width: 12%; text-align: right; }
                                .price { width: 18%; text-align: right; }
                                .total { width: 18%; text-align: right; }
                                .small { font-size: 11px; }
                                .divider { height:1px; background:#000; margin:6px 0; }
                                .right { text-align: right; }
                                .mono { font-family: 'Courier New', monospace; }
                              </style>
                            </head>
                            <body>
                              <div class="receipt mono">
                                ${printContent.innerHTML}
                                <div class="divider"></div>
                                <p class="center small">Downloaded from Brothers System</p>
                              </div>
                              <script>
                                window.onload = function() { window.focus(); window.print(); setTimeout(() => window.close(), 200); }
                              </script>
                            </body>
                          </html>
                        `;

                        win.document.open();
                        win.document.write(html);
                        win.document.close();
                      }}
                      className="flex-1 px-4 py-2 rounded-full text-sm font-semibold flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: palette.mintDeep,
                        color: "#fff",
                      }}
                    >
                      <Download size={14} />
                      Download / Print
                    </button>
                    <button
                      onClick={() => setShowReceipt(false)}
                      className="px-4 py-2 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1px solid ${theme.line}`,
                        color: theme.ink,
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Sale Confirmation Modal */}
            {confirmDeleteSaleId && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={() => setConfirmDeleteSaleId(null)}
              >
                <div
                  className="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
                  style={{
                    backgroundColor: "#fff",
                    border: `1px solid ${palette.line}`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Trash2 size={18} style={{ color: palette.red }} />
                    <h3
                      className="font-bold font-space"
                      style={{ color: palette.ink }}
                    >
                      Delete Sale Record
                    </h3>
                  </div>
                  <p
                    className="text-sm mb-4"
                    style={{ color: palette.inkSoft }}
                  >
                    Are you sure you want to delete this sale record? This
                    action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDeleteSaleId(null)}
                      className="flex-1 px-4 py-2 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1px solid ${theme.line}`,
                        color: theme.ink,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteSale(confirmDeleteSaleId)}
                      disabled={deletingSaleId === confirmDeleteSaleId}
                      className="flex-1 px-4 py-2 rounded-full text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: palette.red, color: "#fff" }}
                    >
                      {deletingSaleId === confirmDeleteSaleId ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />{" "}
                          Deleting...
                        </>
                      ) : (
                        <>Delete</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Clear All Sales Confirmation Modal */}
            {clearAllConfirm && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={() => setClearAllConfirm(false)}
              >
                <div
                  className="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
                  style={{
                    backgroundColor: "#fff",
                    border: `1px solid ${palette.line}`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} style={{ color: palette.red }} />
                    <h3
                      className="font-bold font-space"
                      style={{ color: palette.ink }}
                    >
                      Clear All Sales History
                    </h3>
                  </div>
                  <p
                    className="text-sm mb-4"
                    style={{ color: palette.inkSoft }}
                  >
                    Are you sure you want to delete <strong>all</strong> sales
                    records ({sales.length} transactions)? This action cannot be
                    undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setClearAllConfirm(false)}
                      className="flex-1 px-4 py-2 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1px solid ${theme.line}`,
                        color: theme.ink,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmClearAllSales}
                      className="flex-1 px-4 py-2 rounded-full text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ backgroundColor: palette.red, color: "#fff" }}
                    >
                      <Trash2 size={14} />
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  mono = false,
  placeholder = "",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        className="text-xs font-mono uppercase"
        style={{ color: "#3E5850" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none ${mono ? "font-mono" : ""}`}
        style={{
          backgroundColor: "#FBF7EF",
          border: "1px solid #D9D0BC",
          color: "#15332D",
        }}
      />
    </div>
  );
}
