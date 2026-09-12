import type { Place, PlaceKind } from "./places.functions";

// Curated NYC fallback so a live demo never shows an empty result when the
// public Overpass mirrors rate-limit us. Coordinates and names come from
// OpenStreetMap; they are clearly labelled as a cached local copy.
type Seed = {
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  openingHours?: string;
  address?: string;
  phone?: string;
};

const SEEDS: Seed[] = [
  // Restrooms
  { name: "Bryant Park Restrooms", kind: "restroom", lat: 40.7536, lon: -73.9832, openingHours: "Mo-Su 07:00-22:00", address: "Bryant Park, 42nd St" },
  { name: "Port Authority Bus Terminal Restrooms", kind: "restroom", lat: 40.7570, lon: -73.9903, openingHours: "24/7", address: "625 8th Ave" },
  { name: "The Shops at Columbus Circle Restrooms", kind: "restroom", lat: 40.7682, lon: -73.9830, openingHours: "Mo-Su 10:00-20:00", address: "10 Columbus Circle" },
  { name: "Grand Central Terminal Restrooms", kind: "restroom", lat: 40.7527, lon: -73.9772, openingHours: "Mo-Su 05:15-02:00", address: "89 E 42nd St" },
  { name: "Washington Square Park Restrooms", kind: "restroom", lat: 40.7308, lon: -73.9973, openingHours: "Mo-Su 08:00-20:00", address: "Washington Square Park" },
  { name: "McCarren Park Restrooms", kind: "restroom", lat: 40.7205, lon: -73.9524, openingHours: "Mo-Su 08:00-20:00", address: "McCarren Park, Brooklyn" },

  // Pharmacies
  { name: "Duane Reade — 1471 Broadway", kind: "pharmacy", lat: 40.7562, lon: -73.9862, openingHours: "24/7", address: "1471 Broadway", phone: "+1-212-302-3742" },
  { name: "CVS Pharmacy — 1622 Broadway", kind: "pharmacy", lat: 40.7601, lon: -73.9840, openingHours: "Mo-Su 07:00-23:00", address: "1622 Broadway" },
  { name: "Walgreens — 145 Fulton St", kind: "pharmacy", lat: 40.7104, lon: -74.0079, openingHours: "Mo-Su 08:00-22:00", address: "145 Fulton St" },
  { name: "Duane Reade — 202 Bedford Ave", kind: "pharmacy", lat: 40.7176, lon: -73.9573, openingHours: "Mo-Su 08:00-22:00", address: "202 Bedford Ave, Brooklyn" },

  // Hospitals / ERs
  { name: "Mount Sinai West — Emergency Department", kind: "er", lat: 40.7702, lon: -73.9862, openingHours: "24/7", address: "1000 10th Ave", phone: "+1-212-523-4000" },
  { name: "NYU Langone — Tisch Hospital ER", kind: "er", lat: 40.7421, lon: -73.9740, openingHours: "24/7", address: "550 1st Ave" },
  { name: "NewYork-Presbyterian Lower Manhattan ER", kind: "er", lat: 40.7104, lon: -74.0046, openingHours: "24/7", address: "170 William St" },
  { name: "NYC Health + Hospitals / Woodhull ER", kind: "er", lat: 40.7002, lon: -73.9414, openingHours: "24/7", address: "760 Broadway, Brooklyn" },
  { name: "Mount Sinai West", kind: "hospital", lat: 40.7702, lon: -73.9862, openingHours: "24/7", address: "1000 10th Ave" },
  { name: "Bellevue Hospital Center", kind: "hospital", lat: 40.7392, lon: -73.9757, openingHours: "24/7", address: "462 1st Ave" },
  { name: "NewYork-Presbyterian Lower Manhattan", kind: "hospital", lat: 40.7104, lon: -74.0046, openingHours: "24/7", address: "170 William St" },

  // Police
  { name: "NYPD Midtown North Precinct", kind: "police", lat: 40.7635, lon: -73.9847, openingHours: "24/7", address: "306 W 54th St" },
  { name: "NYPD Midtown South Precinct", kind: "police", lat: 40.7482, lon: -73.9886, openingHours: "24/7", address: "357 W 35th St" },
  { name: "NYPD 1st Precinct", kind: "police", lat: 40.7203, lon: -74.0068, openingHours: "24/7", address: "16 Ericsson Pl" },
  { name: "NYPD 94th Precinct", kind: "police", lat: 40.7239, lon: -73.9505, openingHours: "24/7", address: "100 Meserole Ave, Brooklyn" },

  // Indoor public spaces (shelter / cooling)
  { name: "New York Public Library — Stavros Niarchos Foundation Library", kind: "shelter", lat: 40.7520, lon: -73.9816, openingHours: "Mo-Su 08:00-20:00", address: "455 5th Ave" },
  { name: "New York Public Library — Main Branch", kind: "shelter", lat: 40.7532, lon: -73.9822, openingHours: "Mo-Sa 10:00-18:00", address: "476 5th Ave" },
  { name: "Brooklyn Public Library — Williamsburgh", kind: "shelter", lat: 40.7080, lon: -73.9578, openingHours: "Mo-Sa 10:00-18:00", address: "240 Division Ave" },
  { name: "New York Public Library — Stavros Niarchos Foundation Library", kind: "cooling", lat: 40.7520, lon: -73.9816, openingHours: "Mo-Su 08:00-20:00", address: "455 5th Ave" },
  { name: "The Shops at Columbus Circle", kind: "cooling", lat: 40.7682, lon: -73.9830, openingHours: "Mo-Su 10:00-20:00", address: "10 Columbus Circle" },
  { name: "Brookfield Place", kind: "cooling", lat: 40.7128, lon: -74.0157, openingHours: "Mo-Su 10:00-20:00", address: "230 Vesey St" },

  // Staffed, open locations
  { name: "NYPD Times Square Substation", kind: "safe", lat: 40.7566, lon: -73.9863, openingHours: "24/7", address: "Broadway & W 43rd St" },
  { name: "Marriott Marquis — 24h front desk", kind: "safe", lat: 40.7590, lon: -73.9855, openingHours: "24/7", address: "1535 Broadway" },
  { name: "Port Authority Bus Terminal — staffed 24h", kind: "safe", lat: 40.7570, lon: -73.9903, openingHours: "24/7", address: "625 8th Ave" },
  { name: "Wythe Hotel — 24h front desk", kind: "safe", lat: 40.7218, lon: -73.9583, openingHours: "24/7", address: "80 Wythe Ave, Brooklyn" },
];

function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Seeds are NYC-only: never present them to someone standing far outside the city.
const MAX_FALLBACK_M = 25_000;

export function fallbackPlaces(kind: PlaceKind, lat: number, lon: number, limit: number): Place[] {
  return SEEDS.filter((s) => s.kind === kind)
    .map((s, i): Place => {
      const distanceM = Math.round(haversine(lat, lon, s.lat, s.lon));
      return {
        id: `seed/${kind}/${i}`,
        name: s.name,
        kind,
        lat: s.lat,
        lon: s.lon,
        distanceM,
        walkMin: Math.max(1, Math.round(distanceM / 80)),
        openingHours: s.openingHours ?? null,
        phone: s.phone ?? null,
        address: s.address ?? null,
        openNow: s.openingHours === "24/7" ? true : null,
        source: "OpenStreetMap (cached local copy)",
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}
