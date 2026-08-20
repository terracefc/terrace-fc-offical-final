"use client"

import { useEffect, useMemo } from "react"
import L from "leaflet"
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet"

type DeliveryLocationMapProps = {
  latitude: number
  longitude: number
  zoom: number
  onLocationChange: (latitude: number, longitude: number) => void
  onZoomChange: (zoom: number) => void
}

export default function DeliveryLocationMap({
  latitude,
  longitude,
  zoom,
  onLocationChange,
  onZoomChange,
}: DeliveryLocationMapProps) {
  const markerIcon = useMemo(() => L.divIcon({
    className: "",
    html: '<span class="delivery-map-pin"><span></span></span>',
    iconSize: [32, 42],
    iconAnchor: [16, 40],
  }), [])

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={zoom}
      minZoom={3}
      maxZoom={20}
      scrollWheelZoom
      className="h-full w-full"
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <MapController
        latitude={latitude}
        longitude={longitude}
        zoom={zoom}
        onLocationChange={onLocationChange}
        onZoomChange={onZoomChange}
      />
      <Marker
        position={[latitude, longitude]}
        icon={markerIcon}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const point = event.target.getLatLng()
            onLocationChange(point.lat, point.lng)
          },
        }}
      />
    </MapContainer>
  )
}

function MapController({
  latitude,
  longitude,
  zoom,
  onLocationChange,
  onZoomChange,
}: DeliveryLocationMapProps) {
  const map = useMap()

  useEffect(() => {
    map.setView([latitude, longitude], zoom, { animate: false })
  }, [latitude, longitude, map])

  useMapEvents({
    click(event) {
      onLocationChange(event.latlng.lat, event.latlng.lng)
    },
    zoomend(event) {
      onZoomChange(event.target.getZoom())
    },
  })

  return null
}
