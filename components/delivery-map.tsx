"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Coordinates = {
  latitude: number
  longitude: number
}

type DeliveryMapProps = {
  center: Coordinates
  zoom: number
  onZoomChange: (zoom: number) => void
  onCenterChange: (center: Coordinates) => void
}

type PointerPoint = { x: number; y: number }
type Gesture = { type: "pan"; last: PointerPoint } | { type: "pinch"; distance: number; midpoint: PointerPoint } | null

const TILE_SIZE = 256
const MIN_ZOOM = 3
const MAX_ZOOM = 19
const GOOGLE_MAPS_SCRIPT_ID = "terrace-google-maps-script"
const MAP_STOP_DELAY_MS = 650

declare global {
  interface Window {
    google?: any
  }
}

export function DeliveryMap(props: DeliveryMapProps) {
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""
  const [googleReady, setGoogleReady] = useState(false)

  useEffect(() => {
    if (!googleMapsKey) return
    if (window.google?.maps) {
      setGoogleReady(true)
      return
    }

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null
    const script = existingScript || document.createElement("script")
    const handleLoad = () => setGoogleReady(true)
    script.addEventListener("load", handleLoad)

    if (!existingScript) {
      script.id = GOOGLE_MAPS_SCRIPT_ID
      script.async = true
      script.defer = true
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&libraries=places&v=weekly`
      document.head.appendChild(script)
    }

    return () => script.removeEventListener("load", handleLoad)
  }, [googleMapsKey])

  if (googleMapsKey && googleReady) return <GoogleDeliveryMap {...props} />
  return <OsmDeliveryMap {...props} />
}

function GoogleDeliveryMap({ center, zoom, onZoomChange, onCenterChange }: DeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const listenersRef = useRef<any[]>([])
  const onCenterChangeRef = useRef(onCenterChange)
  const onZoomChangeRef = useRef(onZoomChange)

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange
    onZoomChangeRef.current = onZoomChange
  }, [onCenterChange, onZoomChange])

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || mapInstanceRef.current) return

    const maps = window.google.maps
    const map = new maps.Map(mapRef.current, {
      center: { lat: center.latitude, lng: center.longitude },
      zoom,
      mapTypeId: "roadmap",
      gestureHandling: "greedy",
      clickableIcons: true,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: true,
      zoomControl: true,
      zoomControlOptions: { position: maps.ControlPosition.RIGHT_TOP },
      styles: [
        { featureType: "poi.business", stylers: [{ visibility: "on" }] },
        { featureType: "transit", stylers: [{ visibility: "on" }] },
      ],
    })
    const marker = new maps.Marker({
      map,
      position: { lat: center.latitude, lng: center.longitude },
      title: "Delivery address",
      animation: maps.Animation.DROP,
      draggable: true,
    })

    mapInstanceRef.current = map
    markerRef.current = marker
    listenersRef.current = [
      map.addListener("dragend", () => {
        const mapCenter = map.getCenter()
        if (!mapCenter) return
        onCenterChangeRef.current({ latitude: mapCenter.lat(), longitude: mapCenter.lng() })
      }),
      marker.addListener("dragend", () => {
        const position = marker.getPosition()
        if (!position) return
        onCenterChangeRef.current({ latitude: position.lat(), longitude: position.lng() })
      }),
      map.addListener("zoom_changed", () => {
        const nextZoom = map.getZoom()
        if (typeof nextZoom === "number") onZoomChangeRef.current(nextZoom)
      }),
    ]

    return () => {
      listenersRef.current.forEach((listener) => listener.remove?.())
      listenersRef.current = []
      marker.setMap(null)
      mapInstanceRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const marker = markerRef.current
    if (!map || !marker) return

    const nextCenter = { lat: center.latitude, lng: center.longitude }
    const currentCenter = map.getCenter()
    if (!currentCenter || Math.abs(currentCenter.lat() - center.latitude) > 0.00001 || Math.abs(currentCenter.lng() - center.longitude) > 0.00001) {
      map.setCenter(nextCenter)
    }
    marker.setPosition(nextCenter)
    if (typeof map.getZoom === "function" && map.getZoom() !== zoom) map.setZoom(zoom)
  }, [center.latitude, center.longitude, zoom])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#e8eef2]">
      <div ref={mapRef} className="h-full w-full" aria-label="Detailed Google map showing the delivery address" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[9px] font-bold text-slate-700 shadow-sm">
        Google Maps
      </div>
    </div>
  )
}

function OsmDeliveryMap({ center, zoom, onZoomChange, onCenterChange }: DeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const pointersRef = useRef(new Map<number, PointerPoint>())
  const gestureRef = useRef<Gesture>(null)
  const commitTimerRef = useRef<number | null>(null)
  const [view, setView] = useState({ latitude: center.latitude, longitude: center.longitude, zoom })

  useEffect(() => setView({ latitude: center.latitude, longitude: center.longitude, zoom }), [center.latitude, center.longitude, zoom])
  useEffect(() => () => { if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current) }, [])

  const scheduleCommit = () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current)
    commitTimerRef.current = window.setTimeout(() => {
      setView((current) => {
        onCenterChange({ latitude: current.latitude, longitude: current.longitude })
        onZoomChange(current.zoom)
        return current
      })
    }, MAP_STOP_DELAY_MS)
  }

  const moveByPixels = (deltaX: number, deltaY: number) => {
    setView((current) => {
      const tileZoom = Math.floor(current.zoom)
      const scale = Math.pow(2, current.zoom - tileZoom)
      const projected = project(current.latitude, current.longitude, tileZoom)
      return unproject(projected.x - deltaX / scale, projected.y - deltaY / scale, tileZoom, current.zoom)
    })
  }

  const zoomBy = (delta: number, anchor?: PointerPoint) => {
    setView((current) => {
      const nextZoom = clamp(current.zoom + delta, MIN_ZOOM, MAX_ZOOM)
      if (!anchor || !mapRef.current) return { ...current, zoom: nextZoom }
      const rect = mapRef.current.getBoundingClientRect()
      const tileZoom = Math.floor(current.zoom)
      const scale = Math.pow(2, current.zoom - tileZoom)
      const projected = project(current.latitude, current.longitude, tileZoom)
      const worldX = projected.x + (anchor.x - (rect.left + rect.width / 2)) / scale
      const worldY = projected.y + (anchor.y - (rect.top + rect.height / 2)) / scale
      const anchorCenter = unproject(worldX, worldY, tileZoom, current.zoom)
      const nextTileZoom = Math.floor(nextZoom)
      const nextScale = Math.pow(2, nextZoom - nextTileZoom)
      const nextWorld = project(anchorCenter.latitude, anchorCenter.longitude, nextTileZoom)
      return { ...unproject(nextWorld.x - (anchor.x - (rect.left + rect.width / 2)) / nextScale, nextWorld.y - (anchor.y - (rect.top + rect.height / 2)) / nextScale, nextTileZoom, nextZoom), zoom: nextZoom }
    })
  }

  const point = (event: React.PointerEvent<HTMLDivElement>) => ({ x: event.clientX, y: event.clientY })
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, point(event))
    gestureRef.current = pointersRef.current.size === 1 ? { type: "pan", last: point(event) } : createPinchGesture(pointersRef.current)
  }
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, point(event))
    const gesture = gestureRef.current
    if (!gesture) return
    event.preventDefault()
    if (pointersRef.current.size >= 2 && gesture.type === "pinch") {
      const next = createPinchGesture(pointersRef.current)
      if (!next || next.type !== "pinch") return
      moveByPixels(next.midpoint.x - gesture.midpoint.x, next.midpoint.y - gesture.midpoint.y)
      if (gesture.distance > 0 && next.distance > 0) zoomBy(Math.log2(next.distance / gesture.distance), next.midpoint)
      gestureRef.current = next
      scheduleCommit()
      return
    }
    if (pointersRef.current.size === 1 && gesture.type === "pan") {
      const nextPoint = point(event)
      moveByPixels(nextPoint.x - gesture.last.x, nextPoint.y - gesture.last.y)
      gestureRef.current = { type: "pan", last: nextPoint }
      scheduleCommit()
    }
  }
  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0]
      gestureRef.current = { type: "pan", last: remaining }
    } else if (pointersRef.current.size === 0) {
      gestureRef.current = null
      scheduleCommit()
    }
  }

  const tiles = useMemo(() => {
    const tileZoom = Math.floor(view.zoom)
    const scale = Math.pow(2, view.zoom - tileZoom)
    const projected = project(view.latitude, view.longitude, tileZoom)
    const radius = 3
    const centerTileX = Math.floor(projected.x / TILE_SIZE)
    const centerTileY = Math.floor(projected.y / TILE_SIZE)
    const items: Array<{ key: string; url: string; left: number; top: number; size: number }> = []
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const tileX = centerTileX + offsetX
      const tileY = centerTileY + offsetY
      const worldTiles = Math.pow(2, tileZoom)
      if (tileY < 0 || tileY >= worldTiles) continue
      const wrappedX = ((tileX % worldTiles) + worldTiles) % worldTiles
      items.push({ key: `${tileZoom}-${tileX}-${tileY}`, url: `https://tile.openstreetmap.org/${tileZoom}/${wrappedX}/${tileY}.png`, left: (tileX * TILE_SIZE - projected.x) * scale, top: (tileY * TILE_SIZE - projected.y) * scale, size: TILE_SIZE * scale })
    }
    return items
  }, [view])

  return (
    <div ref={mapRef} className="relative h-full w-full select-none overflow-hidden bg-[#dfe6ea]" style={{ touchAction: "none", cursor: gestureRef.current ? "grabbing" : "grab" }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={(event) => { event.preventDefault(); zoomBy(-event.deltaY * 0.002, { x: event.clientX, y: event.clientY }); scheduleCommit() }}>
      <div className="absolute inset-0 overflow-hidden">
        {tiles.map((tile) => <img key={tile.key} src={tile.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)`, width: tile.size, height: tile.size }} />)}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full"><div className="h-7 w-7 rounded-full border-[3px] border-white bg-red-600 shadow-[0_2px_8px_rgba(0,0,0,0.55)]" /><div className="mx-auto h-3 w-3 -translate-y-1.5 rotate-45 bg-red-600" /></div>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[9px] font-bold text-slate-700 shadow-sm">© OpenStreetMap contributors</div>
    </div>
  )
}

function createPinchGesture(pointers: Map<number, PointerPoint>): Gesture {
  const points = Array.from(pointers.values())
  if (points.length < 2) return null
  const [first, second] = points
  return { type: "pinch", distance: Math.hypot(second.x - first.x, second.y - first.y), midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } }
}

function project(latitude: number, longitude: number, zoom: number) {
  const size = TILE_SIZE * Math.pow(2, zoom)
  const clampedLatitude = clamp(latitude, -85.05112878, 85.05112878)
  const sin = Math.sin((clampedLatitude * Math.PI) / 180)
  return { x: ((longitude + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size }
}

function unproject(x: number, y: number, tileZoom: number, zoom: number) {
  const size = TILE_SIZE * Math.pow(2, tileZoom)
  const wrappedX = ((x % size) + size) % size
  return { latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI, longitude: (wrappedX / size) * 360 - 180, zoom }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
