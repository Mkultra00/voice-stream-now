import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live National Weather Service alerts for the five boroughs.
const NYC_ZONES = ["NYZ072", "NYZ073", "NYZ074", "NYZ075", "NYZ076", "NYZ077", "NYZ078"];

export type LiveAlert = {
  id: string;
  event: string;
  severity: string;
  headline: string;
  instruction: string | null;
  areaDesc: string;
  expires: string | null;
  polygon: [number, number][] | null;
  source: string;
};

export type AlertsResult = {
  alerts: LiveAlert[];
  checkedAt: string;
  feedOk: boolean;
  source: string;
};

const UA = "EmergencyConcierge-Hackathon (contact: demo@example.com)";

export const getAlerts = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({}).optional().parse(data))
  .handler(async (): Promise<AlertsResult> => {
    const url = `https://api.weather.gov/alerts/active?zone=${NYC_ZONES.join(",")}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/geo+json" },
      });
      if (!res.ok) throw new Error(`NWS ${res.status}`);
      const json = (await res.json()) as { features?: unknown[] };
      const alerts = (json.features ?? []).map((f) => normalize(f as NwsFeature));
      return {
        alerts,
        checkedAt: new Date().toISOString(),
        feedOk: true,
        source: "National Weather Service (api.weather.gov)",
      };
    } catch (error) {
      console.error("NWS alerts fetch failed", error);
      return {
        alerts: [],
        checkedAt: new Date().toISOString(),
        feedOk: false,
        source: "National Weather Service (api.weather.gov)",
      };
    }
  });

type NwsFeature = {
  id?: string;
  geometry?: { type?: string; coordinates?: number[][][] } | null;
  properties?: Record<string, unknown>;
};

function normalize(f: NwsFeature): LiveAlert {
  const p = (f.properties ?? {}) as Record<string, string | null>;
  let polygon: [number, number][] | null = null;
  if (f.geometry?.type === "Polygon" && f.geometry.coordinates?.[0]) {
    polygon = f.geometry.coordinates[0].map((c) => [c[1], c[0]] as [number, number]);
  }
  return {
    id: String(f.id ?? p['id'] ?? Math.random()),
    event: p['event'] ?? "Weather alert",
    severity: p['severity'] ?? "Unknown",
    headline: p['headline'] ?? p['event'] ?? "Weather alert",
    instruction: p['instruction'] ?? null,
    areaDesc: p['areaDesc'] ?? "New York City",
    expires: p['expires'] ?? null,
    polygon,
    source: "NWS",
  };
}
