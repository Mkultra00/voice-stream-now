import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  fromLat: z.number().min(-90).max(90),
  fromLon: z.number().min(-180).max(180),
  toLat: z.number().min(-90).max(90),
  toLon: z.number().min(-180).max(180),
});

type OsrmStep = {
  distance: number;
  duration: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string; location?: [number, number] };
};

type OsrmResponse = {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: Array<{ steps: OsrmStep[] }>;
  }>;
};

export type WalkingDirections = {
  distanceM: number;
  durationMin: number;
  path: [number, number][];
  steps: Array<{ instruction: string; distanceM: number }>;
};

async function streetNameAt(lon: number, lat: number): Promise<string> {
  try {
    const url = `https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "EmergencyConcierge/1.0" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return "";
    const payload = (await response.json()) as { features?: Array<{ properties?: { street?: string; name?: string } }> };
    return payload.features?.[0]?.properties?.street ?? "";
  } catch {
    return "";
  }
}

function stepInstruction(step: OsrmStep, streetName: string) {
  const type = step.maneuver?.type ?? "continue";
  const modifier = step.maneuver?.modifier;
  const turnDir = modifier ? modifier.replace(/\b\w/g, (c) => c.toUpperCase()) : "ahead";
  const street = streetName ? ` onto ${streetName}` : "";

  if (type === "depart") return `Start on ${streetName || "the street"}${modifier ? `, heading ${modifier}` : ""}`;
  if (type === "arrive") return "Arrive at your destination";
  if (type === "roundabout" || type === "rotary") return `Enter the roundabout${street}`;
  if (type === "new name") return streetName ? `Continue onto ${streetName}` : "Continue straight";
  if (type === "fork") return `Keep ${turnDir.toLowerCase()}${street}`;
  if (type === "end of road") return `At the end of the road, turn ${turnDir.toLowerCase()}${street || " onto the next street"}`;
  if (type === "turn") return `Turn ${turnDir.toLowerCase()}${street || " at the next street"}`;
  return `${modifier ? `Continue ${modifier}` : "Continue"}${street}`;
}

export const getWalkingDirections = createServerFn({ method: "GET" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<WalkingDirections> => {
    const coordinates = `${data.fromLon},${data.fromLat};${data.toLon},${data.toLat}`;
    const url = new URL(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordinates}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "true");

    const response = await fetch(url, {
      headers: { "User-Agent": "EmergencyConcierge/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("Walking directions are unavailable right now.");

    const payload = (await response.json()) as OsrmResponse;
    const route = payload.routes?.[0];
    if (payload.code !== "Ok" || !route) throw new Error("No walking route was found.");

    return {
      distanceM: Math.round(route.distance),
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      path: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      steps: await (async () => {
        const allSteps = route.legs.flatMap((leg) => leg.steps);
        // Foot routing often leaves segments unnamed; reverse-geocode each
        // turn point so every instruction can name a street.
        const names = await Promise.all(
          allSteps.map((step) => {
            const loc = step.maneuver?.location;
            return step.name ? Promise.resolve(step.name) : loc ? streetNameAt(loc[0], loc[1]) : Promise.resolve("");
          }),
        );
        return allSteps.map((step, i) => ({
          instruction: stepInstruction(step, step.name || names[i] || allSteps.slice(i + 1).find((s) => s.name)?.name || ""),
          distanceM: Math.round(step.distance),
        }));
      })(),
    };
  });