"use client"

import React, { createContext, useContext, useState, useEffect, useRef } from "react"
import { Kit, kits } from "./data"
import { fetchPublicInventory, getKitSizeStock } from "./inventory-client"
import { EMBROIDERY_ONLY_PRICE, getKitSalePrice, isRetroJersey } from "./pricing"
import { toast } from "sonner"
import { CUSTOMER_AUTH_EVENT, readCustomer } from "./customer-auth"

const CART_STORAGE_KEY = "terrace_cart"
const CART_OWNER_STORAGE_KEY = "terrace_cart_owner"

export type JerseyVersion = "plain" | "fan" | "player" | "master" | "embroidery"
export type JerseyBackOption = "original" | "plain" | "custom"

export type JerseyCustomization = {
  enabled: boolean
  mode?: JerseyBackOption
  name?: string
  number?: string
  patches?: boolean
  patchType?: string
  f1Custom?: boolean
}

export const JERSEY_VERSION_PRICES: Record<JerseyVersion, number> = {
  plain: 1199,
  fan: 999,
  player: 1199,
  master: 1099,
  embroidery: EMBROIDERY_ONLY_PRICE,
}

export const ORIGINAL_NAME_PRICE = 199
export const CUSTOMIZATION_PRICE = 300
export const PATCHES_PRICE = 200

export interface CartItem {
  lineId: string;
  kit: Kit;
  quantity: number;
  size: string;
  version?: JerseyVersion;
  customization?: JerseyCustomization;
}

interface StoreContextType {
  cart: CartItem[];
  favorites: number[];
  isCartOpen: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  addToCart: (kit: Kit, size: string, options?: { version?: JerseyVersion; customization?: JerseyCustomization }) => void;
  removeFromCart: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  toggleFavorite: (kitId: number) => void;
  isFavorite: (kitId: number) => boolean;
  openCart: () => void;
  closeCart: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  clearCart: () => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const cartRef = useRef<CartItem[]>([])
  const cartOwnerRef = useRef("")

  useEffect(() => {
    cartRef.current = cart
  }, [cart])

  const saveCartLocally = (nextCart: CartItem[], ownerEmail = "") => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart))
    if (ownerEmail) {
      localStorage.setItem(CART_OWNER_STORAGE_KEY, ownerEmail)
    } else {
      localStorage.removeItem(CART_OWNER_STORAGE_KEY)
    }
    cartOwnerRef.current = ownerEmail
  }

  const saveCartToAccount = (nextCart: CartItem[], email: string) => {
    fetch("/api/customer/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ cart: nextCart }),
    }).catch(() => null)
  }

  const syncCartForSignedInCustomer = async () => {
    const customer = readCustomer()
    if (!customer?.email) {
      // Do not show one customer's cart to the next visitor after sign-out.
      if (cartOwnerRef.current) {
        cartRef.current = []
        setCart([])
        saveCartLocally([])
      }
      return
    }

    const email = customer.email.trim().toLowerCase()
    const previousOwner = cartOwnerRef.current
    const guestCart = previousOwner ? [] : cartRef.current

    try {
      const response = await fetch("/api/customer/cart", { cache: "no-store", credentials: "same-origin" })
      if (!response.ok) return
      const data = await response.json().catch(() => null)
      const savedCart = normalizeStoredCart(data?.cart)
      // A cart already belonging to this account is loaded from the account as
      // the source of truth. A guest cart is merged once when they first sign in.
      const nextCart = previousOwner === email ? savedCart : mergeCarts(savedCart, guestCart)
      cartRef.current = nextCart
      setCart(nextCart)
      saveCartLocally(nextCart, email)

      if (previousOwner !== email && guestCart.length > 0) {
        saveCartToAccount(nextCart, email)
      }
    } catch {
      // Local cart remains usable if the network is temporarily unavailable.
    }
  }

  // Load a guest cart on mount. Account carts are fetched after the signed-in
  // customer session is restored, so they follow the customer on every device.
  useEffect(() => {
    try {
      cartOwnerRef.current = localStorage.getItem(CART_OWNER_STORAGE_KEY) || ""
      const signedInCustomer = readCustomer()
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart && (!cartOwnerRef.current || signedInCustomer?.email?.toLowerCase() === cartOwnerRef.current)) {
        const parsed = JSON.parse(savedCart)
        const restoredCart = normalizeStoredCart(parsed)
        cartRef.current = restoredCart
        setCart(restoredCart)
        saveCartLocally(restoredCart, cartOwnerRef.current)
      } else if (cartOwnerRef.current) {
        // This browser belongs to a different signed-out customer. Keep it empty
        // until the correct customer signs in and their saved cart is fetched.
        cartRef.current = []
        setCart([])
      }

      const savedFavorites = localStorage.getItem("terrace_favorites");
      if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
    } catch (e) {
      console.error("Failed to load store data", e);
    }

    syncCartForSignedInCustomer()
    const handleCustomerChange = () => { syncCartForSignedInCustomer() }
    window.addEventListener(CUSTOMER_AUTH_EVENT, handleCustomerChange)
    return () => window.removeEventListener(CUSTOMER_AUTH_EVENT, handleCustomerChange)
  }, []);

  useEffect(() => {
    fetchPublicInventory(kits).then((inventory) => {
      setCart((current) => {
        if (current.length === 0) return current
        const synced = current.flatMap((item) => {
          const liveKit = inventory.find((kit) => kit.id === item.kit.id)
          // A removed jersey must not leave behind a broken cart line.
          return liveKit ? [withCartLineId({ ...item, kit: liveKit })] : []
        })
        cartRef.current = synced
        const customer = readCustomer()
        const ownerEmail = customer?.email?.trim().toLowerCase() || cartOwnerRef.current
        saveCartLocally(synced, ownerEmail)
        if (customer?.email) saveCartToAccount(synced, customer.email)
        return synced
      })
    }).catch(() => null)
  }, [])

  // Save every cart change locally, then to the signed-in customer's account.
  // Phone and delivery details are deliberately not needed until checkout.
  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    cartRef.current = newCart
    try {
      const customer = readCustomer()
      const ownerEmail = customer?.email?.trim().toLowerCase() || ""
      saveCartLocally(newCart, ownerEmail)
      if (customer?.email) saveCartToAccount(newCart, customer.email)
    } catch (e) {
      console.error("Failed to save cart", e);
    }
  };

  // Save favorites to localStorage
  const saveFavorites = (newFavs: number[]) => {
    setFavorites(newFavs);
    try {
      localStorage.setItem("terrace_favorites", JSON.stringify(newFavs));
    } catch (e) {
      console.error("Failed to save favorites", e);
    }
  };

  const addToCart = (kit: Kit, size: string, options: { version?: JerseyVersion; customization?: JerseyCustomization } = {}) => {
    const stock = getKitSizeStock(kit, size)
    const currentQuantity = cart
      .filter((item) => item.kit.id === kit.id && item.size === size)
      .reduce((sum, item) => sum + item.quantity, 0)

    if (stock <= 0 || currentQuantity >= stock) {
      toast.error("Out of stock", {
        description: `${kit.name} is currently unavailable in size ${size}.`,
      })
      return
    }

    const version = options.version || "fan"
    const customization = normalizeCustomization(options.customization)
    const lineId = getCartLineId(kit.id, size, version, customization)
    const existingIndex = cart.findIndex((item) => item.lineId === lineId);

    let newCart = [...cart];
    if (existingIndex > -1) {
      newCart[existingIndex].quantity += 1;
    } else {
      newCart.push({ lineId, kit, quantity: 1, size, version, customization });
    }

    saveCart(newCart);
    
    toast.success(`${kit.name} (${size}) added to cart!`, {
      description: `₹${kit.price.toLocaleString('en-IN')} - ${kit.club}`,
      action: {
        label: "View Cart",
        onClick: () => setIsCartOpen(true)
      }
    });
  };

  const removeFromCart = (lineId: string) => {
    const newCart = cart.filter((item) => item.lineId !== lineId);
    saveCart(newCart);
    toast.info("Item removed from cart");
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(lineId);
      return;
    }
    const targetItem = cart.find((item) => item.lineId === lineId)
    const stock = targetItem ? getKitSizeStock(targetItem.kit, targetItem.size) : 1
    const allowedQuantity = Math.max(1, stock)

    if (quantity > allowedQuantity) {
      toast.error("No more stock available", {
        description: targetItem ? `${targetItem.kit.name} is not available in a higher quantity for size ${targetItem.size}.` : undefined,
      })
      return
    }

    const newCart = cart.map((item) =>
      item.lineId === lineId
        ? { ...item, quantity }
        : item
    );
    saveCart(newCart);
  };

  const toggleFavorite = (kitId: number) => {
    let newFavs = [...favorites];
    const index = newFavs.indexOf(kitId);
    
    if (index > -1) {
      newFavs.splice(index, 1);
      saveFavorites(newFavs);
      toast.info("Removed from favorites");
    } else {
      newFavs.push(kitId);
      saveFavorites(newFavs);
      toast.success("Added to favorites!", {
        description: "You can find this kit in your wishlist."
      });
    }
  };

  const isFavorite = (kitId: number) => {
    return favorites.includes(kitId);
  };

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);
  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => setIsSearchOpen(false);
  const clearCart = () => saveCart([]);

  return (
    <StoreContext.Provider
      value={{
        cart,
        favorites,
        isCartOpen,
        isSearchOpen,
        searchQuery,
        setSearchQuery,
        addToCart,
        removeFromCart,
        updateQuantity,
        toggleFavorite,
        isFavorite,
        openCart,
        closeCart,
        openSearch,
        closeSearch,
        clearCart,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}

function normalizeCustomization(customization?: JerseyCustomization): JerseyCustomization {
  const value = customization || { enabled: false }
  const mode = value.mode || (value.enabled ? "custom" : "plain")
  if (mode !== "custom") return {
    enabled: false,
    mode,
    patches: value.patches === true,
    patchType: value.patches ? String(value.patchType || "").trim() || undefined : undefined,
    f1Custom: value.f1Custom === true,
  }

  return {
    enabled: true,
    mode: "custom",
    name: String(value.name || "").trim().toUpperCase().slice(0, 14),
    number: String(value.number || "").replace(/\D/g, "").slice(0, 2),
    patches: value.patches === true,
    patchType: value.patches ? String(value.patchType || "").trim() || undefined : undefined,
    f1Custom: value.f1Custom === true,
  }
}

function getCartLineId(kitId: number, size: string, version: JerseyVersion, customization: JerseyCustomization) {
  return [
    kitId,
    size,
    version,
    customization.mode || (customization.enabled ? "custom" : "plain"),
    customization.mode === "custom" || customization.enabled ? customization.name || "" : "",
    customization.mode === "custom" || customization.enabled ? customization.number || "" : "",
    customization.patches ? `patches-${customization.patchType || "standard"}` : "",
    customization.f1Custom ? "f1custom" : "",
  ].join("|")
}

function withCartLineId(item: CartItem): CartItem {
  const version = item.version || "fan"
  const customization = normalizeCustomization(item.customization)

  return {
    ...item,
    version,
    customization,
    lineId: item.lineId || getCartLineId(item.kit.id, item.size, version, customization),
  }
}

function normalizeStoredCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isValidStoredCartItem)
    .map((item) => withCartLineId({
      ...item,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      size: String(item.size || ""),
    }))
}

function mergeCarts(savedCart: CartItem[], guestCart: CartItem[]) {
  const merged = new Map<string, CartItem>()

  ;[...savedCart, ...guestCart].forEach((rawItem) => {
    const item = withCartLineId(rawItem)
    const existing = merged.get(item.lineId)
    merged.set(item.lineId, existing
      ? { ...existing, quantity: Math.min(20, existing.quantity + item.quantity) }
      : item)
  })

  return Array.from(merged.values())
}

function isValidStoredCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<CartItem>
  if (!item.kit || typeof item.kit !== "object") return false
  const kit = item.kit as Partial<Kit>
  return Number.isFinite(Number(kit.id)) && typeof kit.name === "string" && typeof item.size === "string" && item.size.trim().length > 0
}

export function getCartItemUnitPrice(item: Pick<CartItem, "kit" | "version" | "customization">) {
  const backOption = item.customization?.mode || (item.customization?.enabled ? "custom" : "plain")
  const basePrice = getJerseyVersionBasePrice(item.kit, item.version, false, backOption)
  return basePrice
    + (isCustomBack(item.customization) ? CUSTOMIZATION_PRICE : 0)
    + (item.customization?.f1Custom ? CUSTOMIZATION_PRICE : 0)
    + (item.customization?.patches ? PATCHES_PRICE : 0)
}

export function getJerseyVersionBasePrice(kit: Kit, version?: JerseyVersion, testModeEnabled = false, backOption: JerseyBackOption = "plain") {
  if (testModeEnabled) return 1
  if (isRetroJersey(kit)) return 1299
  if (kit.productType === "f1" || kit.productType === "kids" || kit.productType === "jacket") return kit.price
  const noNamePrice = JERSEY_VERSION_PRICES[version || "fan"] || getKitSalePrice(kit, testModeEnabled)
  if (backOption === "original") {
    return noNamePrice + ORIGINAL_NAME_PRICE
  }
  return noNamePrice
}

export function getJerseyVersionLabel(version?: JerseyVersion) {
  if (version === "embroidery") return "Embroidered Logo"
  if (version === "master") return "Master Version"
  if (version === "player") return "Player Version"
  if (version === "plain") return "Fan Version"
  return "Fan Version"
}

export function getJerseyBackLabel(customization?: JerseyCustomization) {
  const patches = customization?.patches ? ` + ${customization.patchType ? `${customization.patchType} Patches` : "Patches"}` : ""
  if (isCustomBack(customization)) {
    return `${getCustomPrintLabel(customization)}${patches}`
  }
  if (customization?.f1Custom) return "Customisation Add-on"
  if (customization?.mode === "original") return `Original Player Back${patches}`
  return `Plain Back${patches}`
}

export function getCustomPrintLabel(customization?: JerseyCustomization) {
  const name = (customization?.name || "Name").trim()
  const number = (customization?.number || "00").trim()
  return `${name} ${number}`.trim()
}

export function isCustomBack(customization?: JerseyCustomization) {
  return customization?.mode === "custom" || customization?.enabled === true
}
