import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polygon, Polyline, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";

import type { Place } from "@/lib/places.functions";

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#38bdf8;box-shadow:0 0 0 6px rgba(56,189,248,.25);border:2px solid #0b1220"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const placeIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:3px;background:#fbbf24;border:2px solid #0b1220"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);
  return null;
}

function FitRoute({ path }: { path: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (path.length > 1) map.fitBounds(path, { padding: [28, 28] });
  }, [map, path]);
  return null;
}

export default function MapView({
  lat,
  lon,
  places,
  polygon,
  routePath = [],
}: {
  lat: number;
  lon: number;
  places: Place[];
  polygon: [number, number][] | null;
  routePath?: [number, number][];
}) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", background: "#0b1220" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={lat} lon={lon} />
      {routePath.length > 1 && <FitRoute path={routePath} />}
      {polygon && (
        <Polygon positions={polygon} pathOptions={{ color: "#ef4444", weight: 2, fillOpacity: 0.15 }} />
      )}
      {routePath.length > 1 && <Polyline positions={routePath} pathOptions={{ color: "#fbbf24", weight: 5 }} />}
      <Marker position={[lat, lon]} icon={userIcon} />
      {places.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={placeIcon}>
          <Popup>
            <strong>{p.name}</strong>
            <br />
            {p.walkMin} min walk · {p.distanceM} m
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
