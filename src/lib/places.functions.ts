import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fallbackPlaces } from "./fallback-places";
import { walkMinutes } from "./walk";

// Nearby places from OpenStreetMap via the Overpass API. No API key needed.

export type PlaceKind =
  | "restroom"
  | "pharmacy"
  | "hospital"
  | "er"
  | "police"
  | "shelter"
  | "safe"
  | "cooling";

export type Place = {
  id: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  distanceM: number;
  walkMin: number;
  openingHours: string | null;
  phone: string | null;
  address: string | null;
  openNow: boolean | null;
  source: string;
};

const FILTERS: Record<PlaceKind, string[]> = {
  restroom: ['node["amenity"="toilets"]'],
  pharmacy: ['node["amenity"="pharmacy"]', 'way["amenity"="pharmacy"]'],
  hospital: ['node["amenity"="hospital"]', 'way["amenity"="hospital"]'],
  er: ['node["amenity"="hospital"]["emergency"="yes"]', 'way["amenity"="hospital"]["emergency"="yes"]'],
  police: ['node["amenity"="police"]', 'way["amenity"="police"]'],
  shelter: [
    'node["amenity"="community_centre"]',
    'node["amenity"="library"]',
    'way["amenity"="library"]',
  ],
  cooling: ['node["amenity"="library"]', 'way["amenity"="library"]', 'node["shop"="mall"]'],
  safe: [
    'node["amenity"="police"]',
    'node["tourism"="hotel"]',
    'way["tourism"="hotel"]',
    'node["shop"="convenience"]["opening_hours"="24/7"]',
    'node["amenity"="fuel"]["opening_hours"="24/7"]',
  ],
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const UA = "EmergencyConcierge-Hackathon/1.0 (demo@example.com)";

export const findPlaces = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        lat: z.number(),
        lon: z.number(),
        kind: z.enum([
          "restroom",
          "pharmacy",
          "hospital",
          "er",
          "police",
          "shelter",
          "safe",
          "cooling",
        ]),
        radius: z.number().min(100).max(5000).default(1500),
        limit: z.number().min(1).max(10).default(4),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ places: Place[]; checkedAt: string; source: string }> => {
    const { lat, lon, kind, radius, limit } = data;
    const body = `[out:json][timeout:20];(${FILTERS[kind]
      .map((f) => `${f}(around:${radius},${lat},${lon});`)
      .join("")});out center ${limit * 8};`;

    // Overpass mirrors rate-limit aggressively; cache so a rehearsed demo
    // never hits an empty result, and try each mirror twice.
    const cacheKey = `${kind}|${radius}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < 10 * 60_000) {
      return { places: cached.places.slice(0, limit), checkedAt: new Date(cached.at).toISOString(), source: "OpenStreetMap via Overpass API (cached)" };
    }

    let elements: OverpassElement[] = [];
    outer: for (let attempt = 0; attempt < 2; attempt++) {
      for (const endpoint of ENDPOINTS) {
        try {
          const res = await fetch(`${endpoint}?data=${encodeURIComponent(body)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error(`Overpass ${res.status} at ${endpoint}`);
          const json = (await res.json()) as { elements?: OverpassElement[] };
          if (!json.elements || json.elements.length === 0) throw new Error(`Overpass empty at ${endpoint}`);
          elements = json.elements;
          break outer;
        } catch (error) {
          console.error("Overpass request failed", error);
        }
      }
    }


    const places = elements
      .map((el) => toPlace(el, kind, lat, lon))
      .filter((p): p is Place => p !== null)
      .sort((a, b) => {
        const openDelta = Number(b.openNow === true) - Number(a.openNow === true);
        return openDelta !== 0 ? openDelta : a.distanceM - b.distanceM;
      })
      .slice(0, Math.max(limit, 6));

    if (places.length === 0) {
      // Public Overpass mirrors are flaky; never leave the user with nothing.
      return {
        places: fallbackPlaces(kind, lat, lon, limit),
        checkedAt: new Date().toISOString(),
        source: "OpenStreetMap (cached local copy — live map service unavailable)",
      };
    }

    cache.set(cacheKey, { places, at: Date.now() });

    return {
      places: places.slice(0, limit),
      checkedAt: new Date().toISOString(),
      source: "OpenStreetMap via Overpass API",
    };
  });

const cache = new Map<string, { places: Place[]; at: number }>();


type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function toPlace(el: OverpassElement, kind: PlaceKind, lat: number, lon: number): Place | null {
  const plat = el.lat ?? el.center?.lat;
  const plon = el.lon ?? el.center?.lon;
  if (plat == null || plon == null) return null;
  const tags = el.tags ?? {};
  const distanceM = haversine(lat, lon, plat, plon);
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return {
    id: `${el.type}/${el.id}`,
    name: tags['name'] ?? defaultName(kind),
    kind,
    lat: plat,
    lon: plon,
    distanceM: Math.round(distanceM),
    walkMin: walkMinutes(distanceM),
    openingHours: tags["opening_hours"] ?? null,
    phone: tags["phone"] ?? tags["contact:phone"] ?? null,
    address: street || null,
    openNow: isOpenNow(tags["opening_hours"]),
    source: "OpenStreetMap",
  };
}

function defaultName(kind: PlaceKind): string {
  const names: Record<PlaceKind, string> = {
    restroom: "Public restroom",
    pharmacy: "Pharmacy",
    hospital: "Hospital",
    er: "Emergency department",
    police: "Police station",
    shelter: "Indoor public space",
    cooling: "Indoor cool space",
    safe: "Staffed open location",
  };
  return names[kind];
}

// Only a coarse read of opening_hours: 24/7 is certain, anything else unknown.
function isOpenNow(hours?: string): boolean | null {
  if (!hours) return null;
  if (/24\/7/.test(hours)) return true;
  return null;
}

function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
