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
  maneuver?: { type?: string; modifier?: string };
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

function stepInstruction(step: OsrmStep, nextName?: string) {
  const type = step.maneuver?.type ?? "continue";
  const modifier = step.maneuver?.modifier;
  const turnDir = modifier ? modifier.replace(/\b\w/g, (c) => c.toUpperCase()) : "ahead";
  // In OSRM each step's name is the street you are on *after* the maneuver;
  // fall back to the next step's street so turns always name a road.
  const streetName = step.name || nextName || "";
  const street = streetName ? ` onto ${streetName}` : "";

  if (type === "depart") return `Start on ${step.name || "the street"}${modifier ? `, heading ${modifier}` : ""}`;
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
      steps: (() => {
        const allSteps = route.legs.flatMap((leg) => leg.steps);
        return allSteps.map((step, i) => ({
          instruction: stepInstruction(step, allSteps[i + 1]?.name),
          distanceM: Math.round(step.distance),
        }));
      })(),
    };
  });