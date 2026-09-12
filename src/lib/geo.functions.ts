import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Reverse geocoding through Photon (OpenStreetMap data, no key required).
export const describeLocation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ lat: z.number(), lon: z.number() }).parse(data))
  .handler(async ({ data }): Promise<{ label: string; inNyc: boolean; source: string }> => {
    try {
      const url = `https://photon.komoot.io/reverse?lat=${data.lat}&lon=${data.lon}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "EmergencyConcierge-Hackathon/1.0 (demo@example.com)" },
      });
      if (!res.ok) throw new Error(`Photon ${res.status}`);
      const json = (await res.json()) as {
        features?: { properties?: Record<string, string> }[];
      };
      const p = json.features?.[0]?.properties ?? {};
      const label =
        [p["name"] ?? p["street"], p["district"] ?? p["city"]].filter(Boolean).join(", ") ||
        "your location";
      const inNyc = /new york|brooklyn|queens|bronx|staten island|manhattan/i.test(
        `${p["city"] ?? ""} ${p["district"] ?? ""} ${p["state"] ?? ""}`,
      );
      return { label, inNyc, source: "OpenStreetMap / Photon" };
    } catch (error) {
      console.error("Reverse geocode failed", error);
      return { label: "your location", inNyc: true, source: "OpenStreetMap / Photon" };
    }
  });
