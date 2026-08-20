"use client"

import { FormEvent, MouseEvent, TouchEvent, RefObject, WheelEvent, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CreditCard, Loader2, MapPin, ShoppingBag, Ticket, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSiteSettings } from "@/hooks/use-site-settings"
import { useStore } from "@/lib/store-context"
import { calculateDeliveryCharge } from "@/lib/checkout"
import { readCustomer, saveCustomer, type CustomerAccount } from "@/lib/customer-auth"
import { cartToOrderItems, createOrderId, saveOrder, type OrderAddress, type StoreOrder } from "@/lib/orders"
import { kits } from "@/lib/data"
import { getDisplayKitImages } from "@/lib/kit-images"
import { getSizeDisplayLabel } from "@/lib/inventory-client"
import { getCartItemUnitPrice, getJerseyBackLabel, getJerseyVersionLabel, isCustomBack } from "@/lib/store-context"
import { withDisplayPrice } from "@/lib/pricing"
import { formatMoney, type DisplayCurrency } from "@/lib/currency"
import { OrderSuccessCelebration } from "@/components/order-success-celebration"
import { playNotificationSound } from "@/lib/notification-sounds"

type AddressForm = {
  name: string
  lastName: string
  phone: string
  email: string
  houseNumber: string
  address: string
  deliveryInstructions: string
  country: string
  city: string
  state: string
  pincode: string
  latitude?: number
  longitude?: number
}

type CheckoutMessage = {
  tone: "error" | "info" | "success"
  title: string
  description: string
} | null

type RazorpayOrderResponse = {
  keyId: string
  orderId: string
  amount: number
  currency: string
}

type RazorpaySuccessResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type PinCodeLookup = Record<string, {
  city: string
  district: string
  state: string
  taluk?: string
  offices?: string[]
}>

type DeliveryEstimate = {
  days: number
  estimatedDate: string
  source: "shiprocket" | "bangalore" | "fallback"
}

type PendingIdentity = {
  email: string
  name?: string
  googleSub?: string
}

const PHONE_COUNTRY_OPTIONS = [
  ["India", "+91"], ["United States", "+1"], ["Canada", "+1"], ["United Kingdom", "+44"], ["Germany", "+49"],
  ["France", "+33"], ["Italy", "+39"], ["Spain", "+34"], ["Netherlands", "+31"], ["Switzerland", "+41"],
  ["Austria", "+43"], ["Belgium", "+32"], ["Portugal", "+351"], ["Ireland", "+353"], ["Australia", "+61"],
  ["New Zealand", "+64"], ["Singapore", "+65"], ["Malaysia", "+60"], ["Indonesia", "+62"], ["Thailand", "+66"],
  ["Japan", "+81"], ["South Korea", "+82"], ["China", "+86"], ["Hong Kong", "+852"], ["Bangladesh", "+880"],
  ["Pakistan", "+92"], ["Nepal", "+977"], ["Sri Lanka", "+94"], ["United Arab Emirates", "+971"], ["Saudi Arabia", "+966"],
  ["Qatar", "+974"], ["Kuwait", "+965"], ["Oman", "+968"], ["Bahrain", "+973"], ["South Africa", "+27"],
  ["Nigeria", "+234"], ["Kenya", "+254"], ["Brazil", "+55"], ["Mexico", "+52"], ["Argentina", "+54"],
  ["Russia", "+7"], ["Turkey", "+90"], ["Israel", "+972"],
] as const

let pinCodeLookupCache: Promise<PinCodeLookup> | null = null

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: (response: any) => void) => void
    }
  }
}

type GeoapifySuggestion = {
  properties: {
    formatted?: string
    address_line1?: string
    address_line2?: string
    city?: string
    county?: string
    state?: string
    postcode?: string
    place_id?: string
    latitude?: number
    longitude?: number
  }
}

const initialAddress: AddressForm = {
  name: "",
  lastName: "",
  phone: "",
  email: "",
  houseNumber: "",
  address: "",
  deliveryInstructions: "",
  country: "India",
  city: "",
  state: "",
  pincode: "",
}


function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }

    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

async function validateCouponCode(code: string, subtotal: number, customerEmail = "", itemCount = 0) {
  const response = await fetch("/api/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, subtotal, customerEmail, itemCount }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    return {
      isValid: false,
      reason: data?.error || "Could not validate coupon.",
      coupon: undefined,
      discountAmount: 0,
    }
  }

  return data as {
    isValid: boolean
    reason?: string
    coupon?: { code: string; description: string; partialCod?: boolean; testTotal?: number }
    discountAmount: number
  }
}

export default function CheckoutPage() {
  const router = useRouter()
  const selectedAddressRef = useRef("")
  const lockedMapPinRef = useRef(false)
  const latestAddressQueryRef = useRef("")
  const addressLookupCacheRef = useRef(new Map<string, GeoapifySuggestion[]>())
  const mapDragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const mapTouchRef = useRef<{ distance: number; midpointX: number; midpointY: number } | null>(null)
  const suppressMapClickRef = useRef(false)
  const { cart, clearCart } = useStore()
  const { testModeEnabled } = useSiteSettings()
  const [address, setAddress] = useState<AddressForm>(initialAddress)
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)
  const [pendingIdentity, setPendingIdentity] = useState<PendingIdentity | null>(null)
  const [accountPassword, setAccountPassword] = useState("")
  const [phoneCountryCode, setPhoneCountryCode] = useState("+91")
  const [message, setMessage] = useState<CheckoutMessage>(null)
  const [completedOrderId, setCompletedOrderId] = useState("")
  const [isOrderCelebrating, setIsOrderCelebrating] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [pinLookupStatus, setPinLookupStatus] = useState<"idle" | "loading" | "found" | "not-found">("idle")

  const [couponCodeInput, setCouponCodeInput] = useState("")
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [couponFeedback, setCouponFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [paymentMode, setPaymentMode] = useState<"prepaid" | "partial_cod">("prepaid")
  const [addressSuggestions, setAddressSuggestions] = useState<GeoapifySuggestion[]>([])
  const [isAddressLookupOpen, setIsAddressLookupOpen] = useState(false)
  const [isAddressLookupLoading, setIsAddressLookupLoading] = useState(false)
  const [locationPin, setLocationPin] = useState("")
  const [isLocating, setIsLocating] = useState(false)
  const [isMapLocating, setIsMapLocating] = useState(false)
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null)
  const [mapZoom, setMapZoom] = useState(18)
  const [mapControlMode, setMapControlMode] = useState<"phone" | "mac" | "windows">("windows")
  const [deliveryEstimate, setDeliveryEstimate] = useState<DeliveryEstimate | null>(null)
  const [isDeliveryEstimateLoading, setIsDeliveryEstimateLoading] = useState(false)
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("INR")
  const addressSearchRef = useRef<HTMLDivElement | null>(null)
  const mapPanelRef = useRef<HTMLDivElement | null>(null)
  const countryOptions = useMemo(() => getCountryOptions(), [])

  useEffect(() => {
    setDisplayCurrency("INR")
  }, [])

  useEffect(() => {
    const match = PHONE_COUNTRY_OPTIONS.find(([country]) => country === address.country)
    if (match && match[1] !== phoneCountryCode) setPhoneCountryCode(match[1])
  }, [address.country, phoneCountryCode])

  useEffect(() => {
    const userAgent = navigator.userAgent || ""
    const touchDevice = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0
    if (touchDevice) {
      setMapControlMode("phone")
    } else if (/Mac|iPhone|iPad|iPod/i.test(userAgent)) {
      setMapControlMode("mac")
    } else {
      setMapControlMode("windows")
    }
  }, [])

  useEffect(() => {
    if (customer?.savedAddress?.country) return

    let cancelled = false
    fetch("/api/location/country", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const detectedCountry = typeof data.country === "string" ? data.country : ""
        if (!cancelled && detectedCountry && countryOptions.includes(detectedCountry)) {
          setAddress((current) => current.country === "India" && !current.pincode && !current.city && !current.state
            ? { ...current, country: detectedCountry }
            : current)
        }
      })
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [countryOptions, customer?.savedAddress?.country])

  useEffect(() => {
    const storedCustomer = readCustomer()
    if (storedCustomer) {
      setCustomer(storedCustomer)
      const savedAddress = storedCustomer.savedAddress
      setAddress((current) => ({
        ...current,
        name: current.name || getFirstName(storedCustomer.name),
        lastName: current.lastName || getLastName(storedCustomer.name),
        phone: current.phone || storedCustomer.phone,
        email: current.email || storedCustomer.email,
        houseNumber: current.houseNumber || savedAddress?.houseNumber || "",
        address: current.address || savedAddress?.address || "",
        deliveryInstructions: current.deliveryInstructions || "",
        country: current.country || savedAddress?.country || "India",
        city: current.city || savedAddress?.city || "",
        state: current.state || savedAddress?.state || "",
        pincode: current.pincode || savedAddress?.pincode || "",
        latitude: current.latitude || savedAddress?.latitude,
        longitude: current.longitude || savedAddress?.longitude,
      }))
      return
    }

    let localPending: PendingIdentity | null = null
    try {
      const stored = window.sessionStorage.getItem("terrace_pending_identity")
      localPending = stored ? JSON.parse(stored) as PendingIdentity : null
    } catch {
      localPending = null
    }

    const queryEmail = new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() || ""
    if (!localPending?.email && /^\S+@\S+\.\S+$/.test(queryEmail)) localPending = { email: queryEmail }
    if (localPending?.email) {
      setPendingIdentity(localPending)
      setAddress((current) => ({ ...current, email: current.email || localPending!.email, name: current.name || localPending!.name || "" }))
    }

    fetch("/api/auth/pending", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const googleIdentity = data?.identity as PendingIdentity | null
        if (!googleIdentity?.email) return
        setPendingIdentity(googleIdentity)
        setAddress((current) => ({
          ...current,
          email: current.email || googleIdentity.email,
          name: current.name || googleIdentity.name || "",
        }))
        window.sessionStorage.setItem("terrace_pending_identity", JSON.stringify(googleIdentity))
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    const query = address.address.trim()
    latestAddressQueryRef.current = query

    if (query.length < 3 || normalizeAddressText(selectedAddressRef.current) === normalizeAddressText(query)) {
      setAddressSuggestions([])
      setIsAddressLookupOpen(false)
      setIsAddressLookupLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      const cached = addressLookupCacheRef.current.get(normalizeAddressText(query))
      if (cached) {
        setAddressSuggestions(cached)
        setIsAddressLookupOpen(cached.length > 0)
        setIsAddressLookupLoading(false)
        return
      }

      setIsAddressLookupLoading(true)
      try {
        const locationParams = locationCoords ? `&lat=${encodeURIComponent(locationCoords.latitude)}&lon=${encodeURIComponent(locationCoords.longitude)}` : ""
        const response = await fetch(`/api/address/autocomplete?q=${encodeURIComponent(query)}${locationParams}`, {
          signal: controller.signal,
        })
        const data = await response.json().catch(() => null)
        if (cancelled || latestAddressQueryRef.current !== query) return

        const features = Array.isArray(data.suggestions) ? data.suggestions as GeoapifySuggestion[] : []
        addressLookupCacheRef.current.set(normalizeAddressText(query), features)
        setAddressSuggestions(features)
        setIsAddressLookupOpen(features.length > 0)
      } catch {
        if (!cancelled && latestAddressQueryRef.current === query) {
          setAddressSuggestions([])
          setIsAddressLookupOpen(false)
        }
      } finally {
        if (!cancelled && latestAddressQueryRef.current === query) setIsAddressLookupLoading(false)
      }
    }, 180)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [address.address, locationCoords])

  const effectiveCart = useMemo(() => {
    return cart.map((item) => ({
      ...item,
      kit: {
        ...withDisplayPrice(item.kit, testModeEnabled),
        price: testModeEnabled ? 1 : getCartItemUnitPrice(item),
      },
    }))
  }, [cart, testModeEnabled])

  const subtotal = effectiveCart.reduce((sum, item) => sum + item.kit.price * item.quantity, 0)
  const totalItems = effectiveCart.reduce((sum, item) => sum + item.quantity, 0)
  const isIndiaDelivery = address.country === "India"
  const isInternationalDelivery = !isIndiaDelivery
  const isBangaloreDelivery = isBangaloreAddress(address, deliveryEstimate)
  const deliveryCharge = testModeEnabled || isInternationalDelivery || typeof appliedCoupon?.testTotal === "number"
    ? 0
    : calculateDeliveryCharge(subtotal, totalItems)
  const hasEmbroideredItem = effectiveCart.some((item) => item.version === "embroidery")
  const hasCustomBackItem = effectiveCart.some((item) => item.version !== "embroidery" && isCustomBack(item.customization))
  const customizationLeadTimeDays = hasCustomBackItem ? 3 : 0

  useEffect(() => {
    if (appliedCoupon) {
      validateCouponCode(appliedCoupon.code, subtotal, customer?.email || address.email, totalItems).then((result) => {
        if (result.isValid) {
          setDiscountAmount(result.discountAmount)
        } else {
          setAppliedCoupon(null)
          setDiscountAmount(0)
          setCouponFeedback({ tone: "error", message: result.reason || "Coupon is no longer valid." })
        }
      })
    }
  }, [subtotal, totalItems, appliedCoupon, customer?.email, address.email])

  const convenienceCharge = 0
  const total = isInternationalDelivery
    ? 0
    : typeof appliedCoupon?.testTotal === "number"
    ? appliedCoupon.testTotal
    : Math.max(0, subtotal - discountAmount) + deliveryCharge + convenienceCharge
  const partialCodUnlocked = appliedCoupon?.partialCod === true && isIndiaDelivery
  const partialCodAdvance = Math.min(total, effectiveCart.reduce((sum, item) => {
    const versionAdvance = item.version === "player"
      ? 800
      : item.version === "master"
        ? 700
        : item.version === "embroidery"
          ? 300
          : 600
    const customizationAdvance = isCustomBack(item.customization) ? 125 : 0
    return sum + (versionAdvance + customizationAdvance) * item.quantity
  }, 0))
  const amountToPayNow = paymentMode === "partial_cod" && partialCodUnlocked ? partialCodAdvance : total
  const codBalance = Math.max(0, total - amountToPayNow)
  const deliveryDayRange = getCheckoutDeliveryDayRange(address, deliveryEstimate, customizationLeadTimeDays)
  const selectedDeliveryEstimate = getSelectedDeliveryEstimate(deliveryDayRange)
  const deliveryEstimateLabel = isInternationalDelivery
    ? "International delivery usually takes 10-14 days."
    : deliveryDayRange
    ? `${customizationLeadTimeDays > 0 ? "Custom printing adds about 3 business days. " : ""}Dispatch and delivery estimate: ${deliveryDayRange.min}-${deliveryDayRange.max} days depending on your location.`
    : "Estimated delivery shown after PIN code."
  const deliveryMapQuery = getDeliveryMapQuery(address)
  const hasDeliveryCoordinates = Number.isFinite(address.latitude) && Number.isFinite(address.longitude)
  const deliveryMapHref = hasDeliveryCoordinates
    ? `https://www.google.com/maps?q=${address.latitude},${address.longitude}`
    : deliveryMapQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryMapQuery)}`
      : ""
  const hasAddressForMap = normalizeAddressText(address.address).length >= 5 || hasDeliveryCoordinates
  const shouldShowDeliveryMap = isMapLocating || hasDeliveryCoordinates || address.address.trim().length >= 5
  const mapInstruction = getMapInstruction(mapControlMode)

  useEffect(() => {
    if (address.country !== "India" || !/^\d{6}$/.test(address.pincode)) {
      setDeliveryEstimate(null)
      setIsDeliveryEstimateLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setIsDeliveryEstimateLoading(true)

    const params = new URLSearchParams({
      pincode: address.pincode,
      city: address.city,
    })

    fetch(`/api/shiprocket/estimate?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled) return
        setDeliveryEstimate(data.estimatedDate ? data as DeliveryEstimate : null)
      })
      .catch(() => {
        if (!cancelled) setDeliveryEstimate(null)
      })
      .finally(() => {
        if (!cancelled) setIsDeliveryEstimateLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [address.country, address.pincode, address.city])

  useEffect(() => {
    if (lockedMapPinRef.current) return

    // Geocode the address location only. Flat, house, tower and floor details
    // are delivery instructions and must never move the map pin.
    const fullAddress = [address.address, address.city, address.state, address.pincode, address.country]
      .filter(Boolean)
      .join(", ")

    if (address.address.trim().length < 5) return

    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsMapLocating(true)
      try {
        const response = await fetch(`/api/address/details?text=${encodeURIComponent(fullAddress)}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        const data = await response.json().catch(() => null)
        const latitude = Number(data?.properties?.latitude)
        const longitude = Number(data?.properties?.longitude)

        if (!cancelled && !lockedMapPinRef.current && Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setAddress((current) => ({
            ...current,
            latitude,
            longitude,
          }))
        }
      } catch {
        // Keep the last selected/live pin if the typed address cannot be geocoded.
      } finally {
        if (!cancelled) setIsMapLocating(false)
      }
    }, 500)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [address.address, address.city, address.state, address.pincode, address.country])

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault()
    setCouponFeedback(null)

    if (!couponCodeInput.trim()) {
      setCouponFeedback({ tone: "error", message: "Enter a coupon code." })
      return
    }

    const result = await validateCouponCode(couponCodeInput, subtotal, customer?.email || address.email, totalItems)
    if (!result.isValid) {
      setCouponFeedback({ tone: "error", message: result.reason || "Could not apply coupon." })
      return
    }

    setAppliedCoupon(result.coupon || null)
    setDiscountAmount(result.discountAmount)
    setCouponFeedback({
      tone: "success",
      message: result.coupon?.partialCod ? "Private partial COD unlocked." : `Coupon applied! You saved ₹${result.discountAmount}.`,
    })
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setDiscountAmount(0)
    setCouponCodeInput("")
    setCouponFeedback(null)
    setPaymentMode("prepaid")
  }

  const orderSummary = useMemo(() => {
    return cartToOrderItems(effectiveCart)
  }, [effectiveCart])

  const updateAddress = (field: keyof AddressForm, value: string) => {
    setMessage(null)
    setCompletedOrderId("")
    const nextValue = field === "pincode" ? sanitizePostalCode(value, address.country) : value
    if (field === "pincode") {
      setPinLookupStatus(address.country === "India" && nextValue.length === 6 ? "loading" : "idle")
      if (nextValue !== locationPin) setLocationPin("")
      setAddress((current) => ({
        ...current,
        pincode: nextValue,
        city: current.country === "India" ? "" : current.city,
        state: current.country === "India" ? "" : current.state,
      }))
      return
    }
    if (field === "country") {
      lockedMapPinRef.current = false
      const nextCountry = countryOptions.includes(value) ? value : "India"
      setDisplayCurrency("INR")
      setPinLookupStatus("idle")
      setLocationPin("")
      setAddress((current) => ({ ...current, country: nextCountry, pincode: "", city: "", state: "", latitude: undefined, longitude: undefined }))
      return
    }
    if (field === "address") {
      lockedMapPinRef.current = false
      selectedAddressRef.current = ""
      const pastedPin = extractPincode(nextValue)
      if (pastedPin && pastedPin !== address.pincode) {
        setLocationPin("")
        setPinLookupStatus("loading")
        setAddress((current) => ({
          ...current,
          address: formatAddressCase(removePincodeFromAddress(nextValue)),
          pincode: pastedPin,
          city: "",
          state: "",
          latitude: undefined,
          longitude: undefined,
        }))
        return
      }
    }
    // The map represents the delivery address, not the customer's flat/floor instructions.
    const shouldResetMap = field === "address"
    setAddress((current) => ({
      ...current,
      [field]: nextValue,
      ...(shouldResetMap ? { latitude: undefined, longitude: undefined } : {}),
    }))
  }

  const selectAddressSuggestion = async (suggestion: GeoapifySuggestion) => {
    let { properties } = suggestion

    if (properties.place_id) {
      try {
        const response = await fetch(`/api/address/details?id=${encodeURIComponent(properties.place_id)}&text=${encodeURIComponent(properties.address_line1 || properties.formatted || "")}`)
        const data = await response.json().catch(() => null)
        if (response.ok && data.properties) {
          properties = { ...properties, ...data.properties }
        }
      } catch {
        // Keep the selected autocomplete result if details are unavailable.
      }
    }

    const formattedAddress = properties.formatted || [properties.address_line1, properties.address_line2].filter(Boolean).join(", ")
    const streetAddress = [properties.address_line1, properties.address_line2].filter(Boolean).join(", ") || formattedAddress
    const nextPincode = (properties.postcode || "").replace(/\D/g, "").slice(0, 6)

    const nextAddress = formatAddressCase(streetAddress)
    selectedAddressRef.current = nextAddress
    const selectedLatitude = Number(properties.latitude)
    const selectedLongitude = Number(properties.longitude)
    const hasSelectedCoordinates = Number.isFinite(selectedLatitude) && Number.isFinite(selectedLongitude)
    lockedMapPinRef.current = hasSelectedCoordinates
    setAddress((current) => ({
      ...current,
      address: nextAddress,
      city: nextPincode ? "" : formatAddressCase(properties.city || properties.county || current.city),
      state: nextPincode ? "" : formatAddressCase(properties.state || current.state),
      pincode: nextPincode || current.pincode,
      latitude: hasSelectedCoordinates ? selectedLatitude : undefined,
      longitude: hasSelectedCoordinates ? selectedLongitude : undefined,
    }))
    setAddressSuggestions([])
    setIsAddressLookupOpen(false)
    setIsAddressLookupLoading(false)

    if (nextPincode) {
      setPinLookupStatus("loading")
    }
  }

  const useCurrentLocation = () => {
    setMessage(null)
    addressSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })

    if (!navigator.geolocation) {
      setMessage({
        tone: "error",
        title: "Location unavailable",
        description: "Your browser does not support current location.",
      })
      return
    }

    setIsLocating(true)
    getPreciseCurrentPosition()
      .then(async (position) => {
        try {
          const { latitude, longitude, accuracy } = position.coords
          setLocationCoords({ latitude, longitude })
          setLocationAccuracy(Number.isFinite(accuracy) ? accuracy : null)
          const response = await fetch(`/api/address/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`)
          const data = await response.json().catch(() => null)
          if (!response.ok || !data.properties) {
            throw new Error(data.error || "Could not read your current address.")
          }

          const properties = data.properties as GeoapifySuggestion["properties"]
          const nextPincode = (properties.postcode || "").replace(/\D/g, "").slice(0, 6)
          const nextAddress = [properties.address_line1, properties.address_line2].filter(Boolean).join(", ") || properties.formatted || ""

          lockedMapPinRef.current = true
          setAddress((current) => {
            const foundAddress = formatAddressCase(nextAddress)
            const finalAddress = foundAddress || current.address
            selectedAddressRef.current = finalAddress
            return {
              ...current,
              address: finalAddress,
              city: nextPincode ? "" : formatAddressCase(properties.city || properties.county || current.city),
              state: nextPincode ? "" : formatAddressCase(properties.state || current.state),
              pincode: nextPincode || current.pincode,
              latitude: properties.latitude || latitude,
              longitude: properties.longitude || longitude,
            }
          })

          if (nextPincode) {
            setLocationPin("")
            setPinLookupStatus("loading")
          }
          window.setTimeout(() => {
            mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          }, 250)
          setMessage({
            tone: "info",
            title: "Address filled from your location",
            description: "Check the address, then tap the exact house/building spot on the map if the pin needs a small correction.",
          })
        } catch (error) {
          setMessage({
            tone: "error",
            title: "Location failed",
            description: error instanceof Error ? error.message : "Please enter your address manually.",
          })
        } finally {
          setIsLocating(false)
        }
      })
      .catch(() => {
        setIsLocating(false)
        setMessage({
          tone: "error",
          title: "Location blocked",
          description: "Allow location permission or enter your address manually.",
        })
      })
  }

  const getCoordinateFromMapOffset = (deltaX: number, deltaY: number) => {
    if (!hasDeliveryCoordinates || !Number.isFinite(address.latitude) || !Number.isFinite(address.longitude)) return

    const zoom = mapZoom
    const metersPerPixel = 156543.03392 * Math.cos(address.latitude * Math.PI / 180) / Math.pow(2, zoom)
    const latitudeDelta = -(deltaY * metersPerPixel) / 110540
    const longitudeDelta = (deltaX * metersPerPixel) / (111320 * Math.cos(address.latitude * Math.PI / 180))
    return {
      latitude: Number((address.latitude + latitudeDelta).toFixed(6)),
      longitude: Number((address.longitude + longitudeDelta).toFixed(6)),
    }
  }

  const panMapByPixels = (deltaX: number, deltaY: number) => {
    const next = getCoordinateFromMapOffset(-deltaX, -deltaY)
    if (!next) return
    lockedMapPinRef.current = true
    setLocationCoords(next)
    setLocationAccuracy(null)
    setAddress((current) => ({
      ...current,
      latitude: next.latitude,
      longitude: next.longitude,
    }))
  }

  const lockExactMapPin = async (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressMapClickRef.current) {
      suppressMapClickRef.current = false
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const next = getCoordinateFromMapOffset(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
    if (!next) return
    const { latitude, longitude } = next

    lockedMapPinRef.current = true
    setLocationCoords({ latitude, longitude })
    setLocationAccuracy(null)
    setAddress((current) => ({
      ...current,
      latitude,
      longitude,
    }))
    try {
      const response = await fetch(`/api/address/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`, { cache: "no-store" })
      const data = await response.json().catch(() => null)
      const properties = data?.properties as GeoapifySuggestion["properties"] | undefined
      if (response.ok && properties) {
        const nextPincode = (properties.postcode || "").replace(/\D/g, "").slice(0, 6)
        const nextAddress = [properties.address_line1, properties.address_line2].filter(Boolean).join(", ") || properties.formatted || ""
        const formattedAddress = formatAddressCase(nextAddress)
        if (formattedAddress) selectedAddressRef.current = formattedAddress
        setAddress((current) => ({
          ...current,
          address: formattedAddress || current.address,
          city: nextPincode ? "" : formatAddressCase(properties.city || properties.county || current.city),
          state: nextPincode ? "" : formatAddressCase(properties.state || current.state),
          pincode: nextPincode || current.pincode,
          latitude,
          longitude,
        }))
        if (nextPincode) setPinLookupStatus("loading")
      }
    } catch {
      // Keep the clicked coordinates even if reverse address lookup fails.
    }
    setMessage({
      tone: "success",
      title: "Exact map pin locked",
      description: "The address and coordinates now use the spot you clicked. Keep the flat, floor and landmark details filled for delivery.",
    })
  }

  const commitMapCenter = async (next: { latitude: number; longitude: number }) => {
    lockedMapPinRef.current = true
    setLocationCoords(next)
    setLocationAccuracy(null)
    setAddress((current) => ({ ...current, latitude: next.latitude, longitude: next.longitude }))

    try {
      const response = await fetch(`/api/address/reverse?lat=${encodeURIComponent(next.latitude)}&lon=${encodeURIComponent(next.longitude)}`, { cache: "no-store" })
      const data = await response.json().catch(() => null)
      const properties = data?.properties as GeoapifySuggestion["properties"] | undefined
      if (!response.ok || !properties) return

      const nextPincode = (properties.postcode || "").replace(/\D/g, "").slice(0, 6)
      const nextAddress = [properties.address_line1, properties.address_line2].filter(Boolean).join(", ") || properties.formatted || ""
      const formattedAddress = formatAddressCase(nextAddress)
      if (formattedAddress) selectedAddressRef.current = formattedAddress
      setAddress((current) => ({
        ...current,
        address: formattedAddress || current.address,
        city: nextPincode ? "" : formatAddressCase(properties.city || properties.county || current.city),
        state: nextPincode ? "" : formatAddressCase(properties.state || current.state),
        pincode: nextPincode || current.pincode,
        latitude: next.latitude,
        longitude: next.longitude,
      }))
      if (nextPincode) setPinLookupStatus("loading")
    } catch {
      // Keep the selected center if reverse geocoding is unavailable.
    }
  }

  const zoomMapWithCtrl = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setMapZoom((current) => Math.min(20, Math.max(15, current + (event.deltaY < 0 ? 1 : -1))))
  }

  const startMapDrag = (event: MouseEvent<HTMLButtonElement>) => {
    const shouldDrag = mapControlMode === "mac" ? event.metaKey : event.ctrlKey
    if (!shouldDrag) return
    event.preventDefault()
    mapDragRef.current = { x: event.clientX, y: event.clientY, moved: false }
  }

  const moveMapDrag = (event: MouseEvent<HTMLButtonElement>) => {
    const drag = mapDragRef.current
    if (!drag) return
    event.preventDefault()
    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y
    if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) return
    drag.moved = true
    drag.x = event.clientX
    drag.y = event.clientY
    panMapByPixels(deltaX, deltaY)
  }

  const stopMapDrag = () => {
    if (mapDragRef.current?.moved) suppressMapClickRef.current = true
    mapDragRef.current = null
  }

  const startMapTouch = (event: TouchEvent<HTMLButtonElement>) => {
    if (event.touches.length !== 2) return
    event.preventDefault()
    mapTouchRef.current = getTouchGesture(event.touches)
  }

  const moveMapTouch = (event: TouchEvent<HTMLButtonElement>) => {
    if (event.touches.length !== 2 || !mapTouchRef.current) return
    event.preventDefault()
    const next = getTouchGesture(event.touches)
    const previous = mapTouchRef.current
    panMapByPixels(next.midpointX - previous.midpointX, next.midpointY - previous.midpointY)
    const zoomDelta = next.distance - previous.distance
    if (Math.abs(zoomDelta) > 18) {
      setMapZoom((current) => Math.min(20, Math.max(15, current + (zoomDelta > 0 ? 1 : -1))))
      next.distance = previous.distance
    }
    mapTouchRef.current = next
    suppressMapClickRef.current = true
  }

  const stopMapTouch = () => {
    mapTouchRef.current = null
  }

  useEffect(() => {
    if (address.country !== "India") {
      setPinLookupStatus("idle")
      return
    }
    const pincode = address.pincode.replace(/\D/g, "").slice(0, 6)
    if (!/^\d{6}$/.test(pincode)) {
      setPinLookupStatus("idle")
      return
    }
    if (lockedMapPinRef.current && address.city.trim() && address.state.trim()) {
      setPinLookupStatus("found")
      return
    }
    if (address.city.trim() && address.state.trim() && locationPin === pincode) {
      setPinLookupStatus("found")
      return
    }

    let cancelled = false

    async function lookupPinCode() {
      setPinLookupStatus("loading")
      try {
        const data = await loadPinCodeLookup()
        const entry = data[pincode]

        if (cancelled) return

        if (entry.city && entry.state) {
          setAddress((current) => ({
            ...current,
            pincode,
            city: formatAddressCase(entry.city || current.city),
            state: formatAddressCase(entry.state || current.state),
          }))
          setLocationPin(pincode)
          setPinLookupStatus("found")
          return
        }

        const onlineEntry = await lookupPinCodeOnline(pincode)
        if (cancelled) return

        if (onlineEntry.city && onlineEntry.state) {
          setAddress((current) => ({
            ...current,
            pincode,
            city: formatAddressCase(onlineEntry.city || current.city),
            state: formatAddressCase(onlineEntry.state || current.state),
          }))
          setLocationPin(pincode)
          setPinLookupStatus("found")
          return
        }

        setPinLookupStatus("not-found")
      } catch {
        if (!cancelled) setPinLookupStatus("not-found")
      }
    }

    lookupPinCode()

    return () => {
      cancelled = true
    }
  }, [address.country, address.pincode, address.city, address.state, locationPin])

  const validateAddress = () => {
    const requiredFields: Array<keyof AddressForm> = ["name", "lastName", "phone", "email", "houseNumber", "address", "country", "city", "state", "pincode"]
    const missingField = requiredFields.find((field) => !String(address[field] || "").trim())

    if (missingField === "houseNumber") return "Enter your house or flat number."
    if (missingField === "lastName") return "Enter your last name."
    if (missingField) return missingField === "city" || missingField === "state" ? "Enter city and state for delivery." : "Please fill in all delivery details."
    if (address.country === "India" && !/^[6-9]\d{9}$/.test(address.phone.trim())) return "Enter a valid 10 digit Indian mobile number."
    if (address.country !== "India" && (address.phone.replace(/\D/g, "").length < 6 || address.phone.replace(/\D/g, "").length > 15)) return "Enter a valid phone number."
    if (!/^\S+@\S+\.\S+$/.test(address.email.trim())) return "Enter a valid email address."
    if (address.country === "India" && !/^\d{6}$/.test(address.pincode.trim())) return "Enter a valid 6 digit PIN code."
    if (address.country === "United States" && !/^\d{5}(-\d{4})?$/.test(address.pincode.trim())) return "Enter a valid ZIP code."

    return null
  }

  const sendOrderEmail = async (order: StoreOrder) => {
    await fetch("/api/customer/order-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    }).catch(() => null)
  }

  const buildOrder = (status: StoreOrder["status"], payment?: Pick<StoreOrder, "paymentId" | "razorpayOrderId">): StoreOrder => ({
    id: createOrderId(),
    customerId: customer?.id,
    customerEmail: customer?.email || pendingIdentity?.email || address.email,
    createdAt: new Date().toISOString(),
    status,
    fulfillmentStatus: "confirmed",
    paymentId: payment?.paymentId,
    razorpayOrderId: payment?.razorpayOrderId,
    address: {
      ...address,
      name: getFullName(address.name, address.lastName),
      phone: formatPhoneNumber(address.phone, phoneCountryCode),
    } as OrderAddress,
    items: orderSummary,
    subtotal,
    deliveryCharge,
    convenienceCharge,
    couponCode: appliedCoupon?.code,
    discount: discountAmount,
    total,
    partialCod: paymentMode === "partial_cod" && partialCodUnlocked,
    advancePaid: paymentMode === "partial_cod" && partialCodUnlocked ? amountToPayNow : total,
    codBalance: paymentMode === "partial_cod" && partialCodUnlocked ? codBalance : 0,
    estimatedDelivery: selectedDeliveryEstimate ? formatDeliveryDate(selectedDeliveryEstimate) : undefined,
    deliveryOption: "normal",
    shippingProvider: address.country === "India" ? "delhivery" : "india_post",
  })

  const saveCheckoutAddressToCustomer = () => {
    if (!customer) return

    const nextCustomer = {
      ...customer,
      name: getFullName(address.name, address.lastName),
      phone: formatPhoneNumber(address.phone, phoneCountryCode),
      email: address.email,
      savedAddress: {
        houseNumber: address.houseNumber,
        address: address.address,
        deliveryInstructions: address.deliveryInstructions,
        country: address.country,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
      },
    }

    saveCustomer(nextCustomer)
    setCustomer(nextCustomer)
  }

  const handlePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (cart.length === 0) {
      setMessage({
        tone: "error",
        title: "Cart is empty",
        description: "Add a jersey before continuing to payment.",
      })
      return
    }

    if (!customer && !pendingIdentity) {
      setMessage({
        tone: "error",
        title: "Login required",
        description: "Create or login to your account before payment.",
      })
      return
    }

    if (pendingIdentity && !pendingIdentity.googleSub && accountPassword.trim().length < 6) {
      setMessage({
        tone: "error",
        title: "Create a password",
        description: "Use at least 6 characters so we can save your email account after payment.",
      })
      return
    }

    const validationError = validateAddress()
    if (validationError) {
      setMessage({
        tone: "error",
        title: "Delivery details needed",
        description: validationError,
      })
      return
    }

    setMessage(null)
    setIsPaying(true)

    try {
      if (amountToPayNow <= 0) {
        const order = buildOrder("free")
        const saved = await saveOrder(order)
        const confirmedOrder = saved.order || order
        await sendOrderEmail(confirmedOrder)
        saveCheckoutAddressToCustomer()
        setCompletedOrderId(confirmedOrder.id)
        clearCart()
        setIsPaying(false)
        setIsOrderCelebrating(true)
        playNotificationSound("success")
        setMessage({
          tone: "success",
          title: "Order confirmed",
          description: "Your ₹0 order has been placed. Opening your order details now.",
        })
        window.setTimeout(() => router.push(`/orders/${encodeURIComponent(confirmedOrder.id)}`), 2100)
        return
      }

      const scriptReady = await loadRazorpayScript()
      if (!scriptReady || !window.Razorpay) {
        throw new Error("Razorpay checkout could not be loaded. Please try again.")
      }

      const orderResponse = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountToPayNow,
          address: { ...address, phone: formatPhoneNumber(address.phone, phoneCountryCode) },
          items: orderSummary,
        }),
      })

      const orderData = await orderResponse.json()
      if (!orderResponse.ok) {
        throw new Error(orderData.error || "Unable to create Razorpay order.")
      }

      const razorpayOrder = orderData as RazorpayOrderResponse
      const checkout = new window.Razorpay({
        key: razorpayOrder.keyId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "terrace.fc",
        description: paymentMode === "partial_cod" && partialCodUnlocked
          ? `Advance for ${totalItems} jersey${totalItems === 1 ? "" : "s"}`
          : `${totalItems} jersey${totalItems === 1 ? "" : "s"}`,
        order_id: razorpayOrder.orderId,
        prefill: {
          name: getFullName(address.name, address.lastName),
          email: address.email,
          contact: address.phone.replace(/\D/g, ""),
        },
        notes: {
          address: `${address.houseNumber}, ${address.address}, ${address.city}, ${address.state} ${address.pincode}`,
        },
        theme: {
          color: "#171717",
        },
        handler: async (response: RazorpaySuccessResponse) => {
          const pendingOrder = buildOrder(paymentMode === "partial_cod" && partialCodUnlocked ? "cod" : "paid", {
            paymentId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
          })

          const verifyResponse = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...response,
              order: pendingOrder,
              ...(pendingIdentity ? {
                account: {
                  email: pendingIdentity.email,
                  name: getFullName(address.name, address.lastName),
                  googleSub: pendingIdentity.googleSub,
                  phone: formatPhoneNumber(address.phone, phoneCountryCode),
                  password: accountPassword || undefined,
                },
              } : {}),
            }),
          })
          const verifyData = await verifyResponse.json()

          if (!verifyResponse.ok || !verifyData.verified) {
            setMessage({
              tone: "error",
              title: "Payment verification failed",
              description: verifyData.error || `Please contact support with your Razorpay payment ID ${response.razorpay_payment_id}.`,
            })
            setIsPaying(false)
            return
          }

          const order = verifyData.order || pendingOrder
          try {
            if (!verifyData.orderSaved) {
              const saved = await saveOrder(order)
              await sendOrderEmail(saved.order || order)
            }
            if (verifyData.customer) {
              saveCustomer(verifyData.customer)
              setCustomer(verifyData.customer)
              window.sessionStorage.removeItem("terrace_pending_identity")
              setPendingIdentity(null)
            }
            saveCheckoutAddressToCustomer()
            setCompletedOrderId(order.id)
            clearCart()
            setIsPaying(false)
            setIsOrderCelebrating(true)
            playNotificationSound("success")
            setMessage({
              tone: "success",
              title: "Payment successful",
              description: paymentMode === "partial_cod" && partialCodUnlocked
                ? `${formatMoney(amountToPayNow, displayCurrency)} paid. ${formatMoney(codBalance, displayCurrency)} is due on delivery.`
                : `Order confirmed for ${formatMoney(total, displayCurrency)}. Opening your order details now.`,
            })
            window.setTimeout(() => router.push(`/orders/${encodeURIComponent(order.id)}`), 2100)
          } catch (error) {
            setIsPaying(false)
            setMessage({
              tone: "error",
              title: "Payment captured, order save failed",
              description: `Please contact support with payment ID ${response.razorpay_payment_id}.`,
            })
          }
        },
        modal: {
          ondismiss: () => {
            setIsPaying(false)
            setMessage({
              tone: "info",
              title: "Payment cancelled",
              description: "Your cart is still saved.",
            })
          },
        },
      })

      checkout.on("payment.failed", (response: any) => {
        setIsPaying(false)
        const failure = response?.error || {}
        setMessage({
          tone: "error",
          title: "Payment failed",
          description: [failure.description, failure.code ? `Code: ${failure.code}` : ""].filter(Boolean).join(" ") || "Razorpay could not complete the payment. Please try again.",
        })
      })

      checkout.open()
    } catch (error) {
      setIsPaying(false)
      setMessage({
        tone: "error",
        title: "Checkout unavailable",
        description: error instanceof Error ? error.message : "Please try again.",
      })
    }
  }

  return (
    <main className="min-h-screen bg-[#080506] text-white">
      <OrderSuccessCelebration visible={isOrderCelebrating} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,0.10),transparent_34%),linear-gradient(180deg,rgba(127,29,29,0.16),transparent_38%)]" />
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/86 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="font-black tracking-tight text-xl text-white hover:text-red-300 transition-colors">
            terrace<span className="text-accent">.</span>fc
          </Link>
          <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white hover:text-black">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-6xl">Checkout</h1>
        </div>

        {message && (
          <div className={`mb-6 rounded-2xl border p-4 text-sm ${
            message.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-100"
              : message.tone === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                : "border-accent/30 bg-accent/10 text-white"
          }`}>
            <p className="font-black uppercase tracking-wider text-xs">{message.title}</p>
            <p className="mt-1 text-xs leading-relaxed">{message.description}</p>
          </div>
        )}

        {cart.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center">
            <ShoppingBag className="w-10 h-10 mx-auto text-white/60 mb-3" />
            <h2 className="font-black text-xl">Your cart is empty</h2>
            <p className="text-sm text-white/65 mt-1">Add a jersey before checkout.</p>
            <Button asChild className="mt-5 bg-white text-black hover:bg-red-100">
              <Link href={completedOrderId ? `/orders/${completedOrderId}` : "/orders"}>
                {completedOrderId ? "View Order" : "View Orders"}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
            {!customer && !pendingIdentity ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-sm space-y-5 sm:p-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-accent">Step 1</p>
                  <h2 className="font-black text-xl tracking-tight mt-1">Login or Create Account</h2>
                  <p className="text-sm text-white/65 mt-1">
                    Use the same login and signup pages as your profile. Your cart will stay here while you sign in.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button asChild className="h-14 bg-red-600 text-white hover:bg-red-500 font-black uppercase tracking-wider">
                    <Link href="/login?redirect_url=/checkout">Login</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-14 border-red-300/70 bg-white/10 text-white font-black uppercase tracking-wider hover:bg-white hover:text-black">
                    <Link href="/signup?redirect_url=/checkout">Sign Up</Link>
                  </Button>
                </div>
              </section>
            ) : (
            <form onSubmit={handlePayment} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-sm space-y-5 sm:p-6">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-accent" />
                <h2 className="font-black text-xl tracking-tight">Delivery Address</h2>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/55">
                  {customer ? "Signed in" : pendingIdentity?.googleSub ? "Google details" : "Checkout details"}
                </p>
                <p className="mt-1 font-black">{customer?.name || pendingIdentity?.name || "Your details"}</p>
                <p className="text-xs text-white/65">{customer?.email || pendingIdentity?.email || address.email}{customer?.phone ? ` - ${customer.phone}` : ""}</p>
                {!customer && <p className="mt-2 text-xs text-white/60">Your account is created only after payment succeeds.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CheckoutInput label="First name" value={address.name} onChange={(value) => updateAddress("name", value)} />
                <CheckoutInput label="Last name" value={address.lastName} onChange={(value) => updateAddress("lastName", value)} />
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/65">Mobile number</span>
                  <div className="flex h-11 overflow-hidden rounded-xl border border-white/15 bg-black/40 focus-within:border-accent">
                    <select
                      aria-label="Country calling code"
                      value={`${phoneCountryCode}|${address.country}`}
                      onChange={(event) => {
                        const [code, country] = event.target.value.split("|")
                        setPhoneCountryCode(code)
                        updateAddress("country", country)
                      }}
                      className="w-[108px] border-r border-white/15 bg-black/40 px-2 text-xs font-black text-white outline-none"
                    >
                      {PHONE_COUNTRY_OPTIONS.map(([country, code]) => (
                        <option key={`${country}-${code}`} value={`${code}|${country}`}>{code} {country}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={address.phone}
                      onChange={(event) => updateAddress("phone", event.target.value.replace(/\D/g, "").slice(0, 15))}
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm font-bold text-white outline-none placeholder:text-white/35"
                    />
                  </div>
                </label>
                <CheckoutInput label="Email" value={address.email} onChange={(value) => updateAddress("email", value)} type="email" className="sm:col-span-2" />
                {!customer && pendingIdentity && (
                  <CheckoutInput
                    label={pendingIdentity.googleSub ? "Password (optional for Google)" : "Password for your account"}
                    value={accountPassword}
                    onChange={setAccountPassword}
                    type="password"
                    autoComplete="new-password"
                    className="sm:col-span-2"
                  />
                )}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-white/65">Country</label>
                  <select
                    value={address.country}
                    onChange={(event) => updateAddress("country", event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-bold text-white outline-none focus:border-accent"
                  >
                    {countryOptions.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>
                <div ref={addressSearchRef} className="relative sm:col-span-2 rounded-2xl border-2 border-accent/40 bg-accent/5 p-3 scroll-mt-28">
                  <CheckoutInput
                    label="Search apartment, building, road or area"
                    value={address.address}
                    onChange={(value) => updateAddress("address", value)}
                    autoComplete="address-line2"
                  />
                  {(isAddressLookupOpen || isAddressLookupLoading) && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/15 bg-[#0f0809] text-white shadow-2xl">
                      {isAddressLookupLoading ? (
                        <div className="px-3 py-2 text-xs font-bold text-white/65">Finding address suggestions...</div>
                      ) : (
                        addressSuggestions.map((suggestion, index) => (
                          <button
                            key={`${suggestion.properties.formatted || suggestion.properties.address_line1 || "address"}-${index}`}
                            type="button"
                            onClick={() => selectAddressSuggestion(suggestion)}
                            className="block w-full border-b border-white/10 px-3 py-2 text-left last:border-b-0 hover:bg-red-950/50"
                          >
                            <span className="block text-sm font-black">{suggestion.properties.address_line1 || suggestion.properties.formatted || "Address"}</span>
                            <span className="mt-0.5 block text-xs text-white/62">{suggestion.properties.address_line2 || suggestion.properties.formatted}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 rounded-2xl border-2 border-white/15 bg-black/35 p-3">
                  <CheckoutInput
                    label="Flat / house / floor number"
                    value={address.houseNumber}
                    onChange={(value) => updateAddress("houseNumber", value)}
                    autoComplete="address-line1"
                  />
                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-white/60">
                    Required: add your exact house, flat, block, tower and floor details.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <CheckoutInput
                    label="Delivery instructions (optional)"
                    value={address.deliveryInstructions}
                    onChange={(value) => updateAddress("deliveryInstructions", value)}
                    autoComplete="off"
                  />
                  <p className="mt-1 text-[10px] font-bold text-white/60">
                    Example: call before delivery, leave with security, gate number, landmark or preferred delivery instructions.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <CheckoutInput label={address.country === "India" ? "PIN code" : address.country === "United States" ? "ZIP code" : "Postal code"} value={address.pincode} onChange={(value) => updateAddress("pincode", value)} inputMode={address.country === "India" ? "numeric" : "text"} />
                  {address.country === "India" && pinLookupStatus === "loading" ? (
                    <p className="mt-1 text-[10px] font-bold text-white/60">Finding city and state...</p>
                  ) : address.country === "India" && (!address.city || !address.state) ? (
                    <p className="mt-1 text-[10px] font-bold text-white/60">
                      City and state auto-fill from PIN code. If needed, add them manually in the delivery address.
                    </p>
                  ) : null}
                </div>
                {(address.country !== "India" || address.city || address.state) && (
                  <>
                    <CheckoutInput label="City" value={address.city} onChange={(value) => updateAddress("city", value)} />
                    <CheckoutInput label="State" value={address.state} onChange={(value) => updateAddress("state", value)} />
                  </>
                )}
                {address.country === "India" && address.city && address.state && (
                  <p className="sm:col-span-2 -mt-2 text-[10px] font-black uppercase tracking-widest text-accent">
                    Delivery area detected from address/PIN.
                  </p>
                )}
              </div>

              {partialCodUnlocked && amountToPayNow > 0 && (
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMode("prepaid")}
                    className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${paymentMode === "prepaid" ? "border-accent bg-accent/10" : "border-white/15 bg-black/30"}`}
                  >
                    <CreditCard className="h-4 w-4 text-accent" />
                    <span>
                      <span className="block text-sm font-black uppercase tracking-wider">Razorpay</span>
                      <span className="block text-xs text-white/65">{formatMoney(total, displayCurrency)} with Razorpay</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode("partial_cod")}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors ${paymentMode === "partial_cod" ? "border-accent bg-accent/10" : "border-white/15 bg-black/30"}`}
                  >
                    <span>
                      <span className="block text-sm font-black uppercase tracking-wider">Partial COD</span>
                      <span className="block text-xs text-white/65">
                        Pay {formatMoney(partialCodAdvance, displayCurrency)} now, then {formatMoney(codBalance, displayCurrency)} on delivery.
                      </span>
                    </span>
                    <span className={`h-4 w-4 shrink-0 rounded-full border-4 ${paymentMode === "partial_cod" ? "border-accent bg-white" : "border-white/45"}`} />
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={isPaying || cart.length === 0}
                className="h-14 w-full bg-red-600 text-white hover:bg-white hover:text-black font-black uppercase tracking-wider"
              >
                {isPaying ? <Loader2 className="w-4 h-4 animate-spin" /> : amountToPayNow <= 0 ? <ShoppingBag className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                {isPaying ? "Checking Out" : amountToPayNow <= 0 ? "Place ₹0 Order" : isInternationalDelivery ? "Submit International Order" : paymentMode === "partial_cod" && partialCodUnlocked ? `Pay ₹${amountToPayNow.toLocaleString("en-IN")} Advance` : "Pay with Razorpay"}
              </Button>
            </form>
            )}

            <aside className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-sm space-y-5">
              <h2 className="font-black text-xl tracking-tight">Order Summary</h2>
              <div className="space-y-4">
                {effectiveCart.map((item) => {
                  const kitImages = getDisplayKitImages(item.kit, kits)

                  return (
                  <div key={item.lineId} className="flex gap-3">
                    <div className="h-14 w-14 rounded-lg overflow-hidden relative bg-black/50 border border-white/15 flex-shrink-0">
                      <Image src={kitImages.image} alt={item.kit.name} fill className="object-cover" sizes="56px" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{item.kit.name}</p>
                      <p className="text-xs text-white/65 truncate">{item.kit.club} - Size {getSizeDisplayLabel(item.kit, item.size)}</p>
                      <p className="text-xs text-white/65 truncate">{getJerseyVersionLabel(item.version)}</p>
                      {item.version !== "embroidery" && (
                        <p className="text-xs text-accent truncate">{getJerseyBackLabel(item.customization)}</p>
                      )}
                      <p className="text-xs text-white/65">Qty {item.quantity}</p>
                    </div>
                    <p className="font-black text-sm">{formatMoney(item.kit.price * item.quantity, displayCurrency)}</p>
                  </div>
                  )
                })}
              </div>

              {/* Coupon Form */}
              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-white/65">
                  <Ticket className="w-3.5 h-3.5 text-accent" />
                  Promo Code
                </div>
                
                {!appliedCoupon ? (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <input
                      type="text"
                      value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      className="h-9 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 text-xs font-bold uppercase tracking-wider text-white outline-none placeholder:text-white/35 focus:border-accent"
                    />
                    <button
                      type="submit"
                      className="h-9 rounded-lg bg-red-600 px-4 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black cursor-pointer"
                    >
                      Apply
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs font-bold text-accent">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black tracking-wider">{appliedCoupon.code}</span>
                      <span className="text-[10px] font-normal opacity-90">({appliedCoupon.description})</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="rounded p-0.5 text-white/55 transition-colors hover:text-red-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {couponFeedback && (
                  <p className={`text-[10px] font-bold ${
                    couponFeedback.tone === "error" ? "text-red-500" : "text-emerald-500"
                  }`}>
                    {couponFeedback.message}
                  </p>
                )}
              </div>

              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="flex justify-between text-sm text-white/65">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal, displayCurrency)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-500 font-bold">
                    <span>Discount ({appliedCoupon.code})</span>
                    <span>-{formatMoney(discountAmount, displayCurrency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-white/65">
                  <span>Delivery</span>
                  <span>{deliveryCharge === 0 ? "FREE" : formatMoney(deliveryCharge, displayCurrency)}</span>
                </div>
                {deliveryCharge > 0 && isIndiaDelivery && (
                  <p className="text-xs font-black text-accent">Flat ₹100 delivery across India.</p>
                )}
                {isInternationalDelivery && (
                  <p className="text-xs font-black text-accent">
                    International orders are ₹0 for now. We will contact you directly to confirm shipping and payment.
                  </p>
                )}
                <p className="text-xs font-black text-white/78">
                  {isDeliveryEstimateLoading ? "Checking delivery estimate..." : deliveryEstimateLabel}
                </p>
                <div className="border-t border-white/10" />
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">Total</span>
                  <span className="text-2xl font-black text-accent">{formatMoney(total, displayCurrency)}</span>
                </div>
                {paymentMode === "partial_cod" && partialCodUnlocked && (
                  <>
                    <div className="flex justify-between text-sm font-bold text-emerald-600">
                      <span>Pay now</span>
                      <span>{formatMoney(amountToPayNow, displayCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span>Cash on delivery</span>
                      <span>{formatMoney(codBalance, displayCurrency)}</span>
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}

function CheckoutInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  className = "",
  inputRef,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: "text" | "numeric" | "email" | "tel"
  className?: string
  inputRef?: RefObject<HTMLInputElement | null>
  autoComplete?: string
}) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-white/65">{label}</span>
      <input
        ref={inputRef}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-bold text-white outline-none placeholder:text-white/35 focus:border-accent"
      />
    </label>
  )
}

function getFullName(firstName: string, lastName: string) {
  return [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ")
}

function getFirstName(fullName: string) {
  return String(fullName || "").trim().split(/\s+/)[0] || ""
}

function getLastName(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join(" ") : ""
}

function loadPinCodeLookup() {
  if (!pinCodeLookupCache) {
    pinCodeLookupCache = fetch("/data/india-pincodes.json")
      .then((response) => {
        if (!response.ok) throw new Error("PIN code lookup file could not be loaded.")
        return response.json() as Promise<PinCodeLookup>
      })
  }

  return pinCodeLookupCache
}

async function lookupPinCodeOnline(pincode: string) {
  const response = await fetch(`/api/address/autocomplete?q=${encodeURIComponent(pincode)}`)
  const data = await response.json().catch(() => null)
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions as GeoapifySuggestion[] : []
  const match = suggestions.find((suggestion) => suggestion.properties.postcode === pincode) || suggestions[0]
  const properties = match.properties

  if (!properties.state) return null

  return {
    city: properties.city || properties.county || "",
    state: properties.state,
  }
}

function formatAddressCase(value: string) {
  return value
    .toLowerCase()
    .split(/(\s+|-|,|\.)/)
    .map((part) => {
      if (!/[a-z]/.test(part)) return part
      if (/^(po|ii|iii|iv|vi|vip|mg|btm|hsr|rbi|iit|iim|nri|ncr|dl|ka|tn|up|mp|mh|gj|rj|hr|pb|jk|ut|wb|ap|ts|kl|ga|or|od|br|jh|as|sk|mz|nl|mn|ml|tr)$/i.test(part)) {
        return part.toUpperCase()
      }
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\bAnd\b/g, "and")
    .trim()
}

function normalizeAddressText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractPincode(value: string) {
  return value.match(/\b\d{6}\b/)?.[0] || ""
}

function removePincodeFromAddress(value: string) {
  return value
    .replace(/\b\d{6}\b/g, "")
    .replace(/\b(india|bharat)\b/gi, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,+/g, ",")
    .replace(/\s+/g, " ")
    .replace(/,\s*$/g, "")
    .trim()
}

function getPreciseCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is unavailable."))
      return
    }

    let bestPosition: GeolocationPosition | null = null
    let settled = false
    let watchId: number | null = null

    const finish = () => {
      if (settled) return
      settled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (bestPosition) resolve(bestPosition)
      else reject(new Error("Could not get a precise location."))
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position
        }

        if (position.coords.accuracy <= 25) finish()
      },
      (error) => {
        if (bestPosition) finish()
        else reject(error)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    )

    window.setTimeout(finish, 7000)
  })
}

function formatDeliveryDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "soon"
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date)
}

function getSelectedDeliveryEstimate(range: { min: number; max: number } | null) {
  if (!range) return null
  return addCheckoutDays(new Date(), range.max)
}

function getCheckoutDeliveryDayRange(
  _address: Pick<AddressForm, "city" | "state" | "pincode" | "country">,
  _estimate: DeliveryEstimate | null,
  _extraDays = 0,
) {
  if (_address.country !== "India") return null
  // terrace.fc uses one clear promise for every Indian order. Keeping the
  // range independent of PIN avoids a different estimate appearing later in
  // checkout, the order page, or an email.
  return { min: 10, max: 14 }
}

function getDeliveryMapQuery(address: AddressForm) {
  return [
    address.houseNumber,
    address.address,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ")
}

function getMapInstruction(mode: "phone" | "mac" | "windows") {
  if (mode === "phone") {
    return {
      title: "Move the map under the red pin.",
      short: "One finger pans. Two fingers zoom and pan.",
      detail: "The red pin marks the delivery point. Drag with one finger or use two fingers to pan and pinch smoothly, then release when the pin is centered on the correct building.",
    }
  }

  if (mode === "mac") {
    return {
      title: "Move the map under the red pin.",
      short: "Drag to pan. Scroll to zoom.",
      detail: "Drag the map smoothly and use the scroll wheel to zoom. The red pin stays at the delivery point; release when it is centered on the correct building.",
    }
  }

  return {
    title: "Move the map under the red pin.",
    short: "Drag to pan. Scroll to zoom.",
    detail: "Drag the map smoothly and use the scroll wheel to zoom. The red pin stays at the delivery point; release when it is centered on the correct building.",
  }
}

function getTouchGesture(touches: TouchList) {
  const first = touches[0]
  const second = touches[1]
  const deltaX = second.clientX - first.clientX
  const deltaY = second.clientY - first.clientY
  return {
    distance: Math.hypot(deltaX, deltaY),
    midpointX: (first.clientX + second.clientX) / 2,
    midpointY: (first.clientY + second.clientY) / 2,
  }
}

function addCheckoutDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isBangaloreAddress(address: Pick<AddressForm, "city" | "pincode">, estimate: DeliveryEstimate | null) {
  const city = address.city.toLowerCase()
  return estimate?.source === "bangalore" || address.pincode.startsWith("560") || city.includes("bangalore") || city.includes("bengaluru")
}

function sanitizePostalCode(value: string, country = "India") {
  if (country === "United States") {
    return value.replace(/[^\d-]/g, "").slice(0, 10)
  }
  if (country !== "India") {
    return value.replace(/[^a-zA-Z0-9 -]/g, "").slice(0, 16).toUpperCase()
  }

  return value.replace(/\D/g, "").slice(0, 6)
}

function formatPhoneNumber(value: string, countryCode: string) {
  const digits = value.replace(/\D/g, "")
  return digits ? `${countryCode}${digits}` : ""
}

function getCountryOptions() {
  const countryCodes = [
    "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BR","IO","BN","BG","BF","BI","KH","CM","CA","CV","KY","CF","TD","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY","HT","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM","JP","JE","JO","KZ","KE","KI","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","KP","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC","MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","KR","SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU","VA","VE","VN","VG","VI","WF","EH","YE","ZM","ZW",
  ]

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" })
    const names = countryCodes
      .map((code) => displayNames.of(code))
      .filter((name): name is string => Boolean(name && /^[A-Za-z]/.test(name)))
    return Array.from(new Set(["India", ...names])).sort((left, right) => left === "India" ? -1 : right === "India" ? 1 : left.localeCompare(right))
  } catch {
    return ["India", "United States", "United Kingdom", "Canada", "Australia", "United Arab Emirates"]
  }
}
