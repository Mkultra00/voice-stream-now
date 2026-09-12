export type WebSource = { title: string; url: string; text: string };

/** Heuristic: does this turn benefit from looking something up on the web? */
export function needsResearch(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(search|look ?up|research|google|find out|latest|news|update[sd]?|recall|outbreak|advisory|guidelines?|protocol|cdc|who says|fda|is it true|statistics|report)\b/.test(t))
    return true;
  // Knowledge-ish questions that aren't about the immediate physical scene.
  if (/^(what|who|when|why|how|which|is|are|does|do)\b/.test(t.trim()) && t.length > 25) return true;
  return false;
}

/** Firecrawl web search (direct API). Returns [] on any failure — research is best-effort. */
export async function webResearch(query: string, limit = 4): Promise<WebSource[]> {
  const apiKey = process.env["FIRECRAWL_API_KEY"];
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      console.error(`Firecrawl search failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return [];
    }
    const json = (await res.json()) as {
      data?: { web?: unknown[] } | unknown[];
    };
    const raw = Array.isArray(json.data) ? json.data : ((json.data as { web?: unknown[] })?.web ?? []);
    return (raw as Array<Record<string, unknown>>)
      .map((r) => ({
        title: String(r["title"] ?? "").slice(0, 160),
        url: String(r["url"] ?? ""),
        text: String(r["description"] ?? r["snippet"] ?? r["markdown"] ?? "").replace(/\s+/g, " ").slice(0, 700),
      }))
      .filter((r) => r.url)
      .slice(0, limit);
  } catch (err) {
    console.error("Firecrawl search error", err);
    return [];
  }
}
