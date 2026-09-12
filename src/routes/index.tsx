import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  Mic,
  Phone,
  RefreshCw,
  ShieldAlert,
  X,
  Volume2,
} from "lucide-react";

import { getAlerts, type LiveAlert } from "@/lib/alerts.functions";
import { findPlaces, type Place } from "@/lib/places.functions";
import { describeLocation } from "@/lib/geo.functions";
import { respond, redFlagTurn, postureFromAlerts, type Turn } from "@/lib/concierge";
import { askAgent } from "@/lib/agent.functions";
import { CRITICAL_FACTS, FACTS_VERIFIED_ON, POSTURE_LABEL, type Posture } from "@/lib/critical-facts";
import { buildDemoAlert, DEMO_ALERT_LABELS, type DemoAlertKey } from "@/lib/demo-alerts";
import { buildSimCall, type SimCall } from "@/lib/sim-call";
import { speak, startRecording, stopSpeaking, transcribe, type Recorder } from "@/lib/recorder";
import { formatDistance, formatWalk } from "@/lib/walk";
import { getWalkingDirections, type WalkingDirections } from "@/lib/directions.functions";
import { forgetAll, loadMemory, loadMessages, mergeMemory, saveMemory, saveMessages } from "@/lib/memory";

const MapView = lazy(() => import("@/components/MapView"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Emergency Concierge — NYC" },
      {
        name: "description",
        content:
          "Talk to a voice concierge that reads live National Weather Service alerts, maps the nearest help from OpenStreetMap, and only ever quotes verified emergency numbers.",
      },
      { property: "og:title", content: "Emergency Concierge — NYC" },
      {
        property: "og:description",
        content:
          "Voice-first help for New York City: live weather warnings, nearby open places, verified emergency facts.",
      },
    ],
  }),
  component: Concierge,
});

const FALLBACK = { lat: 40.758, lon: -73.9855 }; // Times Square
const PRESETS = [
  { name: "Times Square", lat: 40.758, lon: -73.9855 },
  { name: "Lower Manhattan", lat: 40.7075, lon: -74.0113 },
  { name: "Williamsburg", lat: 40.7143, lon: -73.9613 },
];

type Msg = { id: number; role: "you" | "concierge"; text: string };

function Concierge() {
  const alertsFn = useServerFn(getAlerts);
  const placesFn = useServerFn(findPlaces);
  const geoFn = useServerFn(describeLocation);
  const directionsFn = useServerFn(getWalkingDirections);
  const agentFn = useServerFn(askAgent);

  const [loc, setLoc] = useState(FALLBACK);
  const [locLabel, setLocLabel] = useState("locating…");
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [feedOk, setFeedOk] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoAlert, setDemoAlert] = useState<LiveAlert | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [simCall, setSimCall] = useState<SimCall | null>(null);
  const [simStep, setSimStep] = useState(0);
  const [tapCount, setTapCount] = useState(0);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [memory, setMemory] = useState<string[]>([]);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesSource, setPlacesSource] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [directions, setDirections] = useState<{ place: Place; route: WalkingDirections } | null>(null);
  const [loadingDirections, setLoadingDirections] = useState<string | null>(null);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const recorderRef = useRef<Recorder | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  const memoryRef = useRef<string[]>([]);
  const hydrated = useRef(false);
  useEffect(() => {
    messagesRef.current = messages;
    if (hydrated.current) saveMessages(messages);
  }, [messages]);
  useEffect(() => {
    memoryRef.current = memory;
    if (hydrated.current) saveMemory(memory);
  }, [memory]);

  // Restore what the concierge remembers about this person.
  useEffect(() => {
    setMessages(loadMessages());
    setMemory(loadMemory());
    hydrated.current = true;
  }, []);

  const activeAlert = demoAlert ?? liveAlerts[0] ?? null;
  const posture: Posture = turn?.posture ?? (demoAlert ? "shelter" : postureFromAlerts(liveAlerts));

  // Location
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setLocLabel("Times Square (default)"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    void geoFn({ data: loc }).then((r) => setLocLabel(r.label));
  }, [loc, geoFn]);

  // Live NWS alerts, refreshed every 60s
  const refreshAlerts = useCallback(async () => {
    const r = await alertsFn({ data: {} });
    setLiveAlerts(r.alerts);
    setFeedOk(r.feedOk);
    setCheckedAt(r.checkedAt);
  }, [alertsFn]);

  useEffect(() => {
    void refreshAlerts();
    const t = setInterval(() => void refreshAlerts(), 60_000);
    return () => clearInterval(t);
  }, [refreshAlerts]);

  const handleText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);
      setDoneSteps([]);
      const history = messagesRef.current.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      setMessages((m) => [...m, { id: Date.now(), role: "you", text }]);
      setThinking(true);
      const ctx = { placeLabel: locLabel, hour: new Date().getHours() };

      // Deterministic red flags always win — no model involved.
      let result = redFlagTurn(text, ctx);
      if (!result) {
        try {
          result = await agentFn({
            data: {
              text,
              history,
              memory: memoryRef.current,
              placeLabel: locLabel,
              localTime: new Date().toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" }),
              alert: activeAlert
                ? {
                    event: activeAlert.event,
                    headline: activeAlert.headline ?? "",
                    expires: activeAlert.expires ?? null,
                    areaDesc: activeAlert.areaDesc ?? "",
                  }
                : null,
            },
          });
        } catch {
          result = respond(text, activeAlert, ctx);
        }
      }
      if ("remember" in result && Array.isArray((result as { remember?: string[] }).remember)) {
        const learned = (result as { remember?: string[] }).remember ?? [];
        if (learned.length) setMemory((prev) => mergeMemory(prev, learned));
      }
      setTurn(result);
      setMessages((m) => [...m, { id: Date.now() + 1, role: "concierge", text: result.spoken }]);
      void speak(result.spoken).catch((e: Error) => setError(e.message));

      if (result.find) {
        setPlaces([]);
        try {
          const r = await placesFn({
            data: { lat: loc.lat, lon: loc.lon, kind: result.find.kind, radius: result.find.radius, limit: 4 },
          });
          setPlaces(r.places);
          setPlacesSource(`${r.source}, checked ${timeOf(r.checkedAt)}`);
        } catch {
          setError("Couldn't reach the map data just now.");
        }
      } else {
        setPlaces([]);
      }
      setThinking(false);
    },
    [activeAlert, agentFn, loc, locLabel, placesFn],
  );

  const startTalk = useCallback(async () => {
    stopSpeaking();
    setError(null);
    try {
      recorderRef.current = await startRecording();
      setListening(true);
    } catch {
      setError("Microphone access is needed to talk. Enable it and try again.");
    }
  }, []);

  const endTalk = useCallback(async () => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    setListening(false);
    if (!rec) return;
    const blob = await rec.stop();
    if (blob.size < 4000) {
      setError("That was too short — hold the button while you speak.");
      return;
    }
    setThinking(true);
    try {
      const text = await transcribe(blob);
      setThinking(false);
      if (!text) {
        setError("I didn't catch that — try again.");
        return;
      }
      await handleText(text);
    } catch (e) {
      setThinking(false);
      setError(e instanceof Error ? e.message : "Voice failed.");
    }
  }, [handleText]);

  const injectDemo = (key: DemoAlertKey) => {
    const a = buildDemoAlert(key, loc.lat, loc.lon);
    setDemoAlert(a);
    setDemoMode(true);
    void handleText("What should I do, I'm on the street");
  };

  const showDirections = async (place: Place) => {
    setError(null);
    setLoadingDirections(place.id);
    try {
      const route = await directionsFn({
        data: { fromLat: loc.lat, fromLon: loc.lon, toLat: place.lat, toLon: place.lon },
      });
      setDirections({ place, route });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Walking directions are unavailable right now.");
    } finally {
      setLoadingDirections(null);
    }
  };

  const versionTap = () => {
    const n = tapCount + 1;
    setTapCount(n);
    if (n >= 3) {
      setDemoOpen(true);
      setTapCount(0);
    }
  };

  const escalationFact = turn?.factId ? CRITICAL_FACTS.find((f) => f.id === turn.factId) : null;

  const startSimCall = (factId: string, number: string) => {
    const call = buildSimCall(factId, number, {
      placeLabel: locLabel,
      localTime: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      alertEvent: activeAlert?.event ?? null,
    });
    setSimCall(call);
    setSimStep(0);
    void speak(call.lines[0]?.text ?? "");
  };

  const advanceSimCall = () => {
    if (!simCall) return;
    const next = Math.min(simStep + 1, simCall.lines.length - 1);
    setSimStep(next);
    void speak(simCall.lines[next]?.text ?? "");
  };

  return (
    <div className="min-h-screen bg-background pb-32 font-sans text-foreground">
      {/* Alert banner */}
      {activeAlert && (
        <div className="flex items-start gap-3 border-b border-destructive/40 bg-destructive/15 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-display font-bold uppercase tracking-wide text-destructive">
              {activeAlert.event} · {activeAlert.areaDesc}
              {activeAlert.source === "DEMO" && " (DEMO)"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {activeAlert.headline}
              {activeAlert.expires && ` — until ${timeOf(activeAlert.expires)}`}
            </p>
          </div>
        </div>
      )}

      <header className="px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Emergency Concierge</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" /> You are near {locLabel}
            </p>
          </div>
          <PostureBadge posture={posture} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
            {feedOk
              ? liveAlerts.length === 0
                ? "NWS: no active alerts"
                : `NWS: ${liveAlerts.length} active`
              : "NWS feed unavailable"}
            {checkedAt && ` · ${timeOf(checkedAt)}`}
          </span>
          <button
            onClick={() => {
              const next = !demoMode;
              setDemoMode(next);
              if (!next) {
                setDemoAlert(null);
                setSimCall(null);
              }
            }}
            aria-pressed={demoMode}
            className={`rounded-full px-2.5 py-1 font-bold ${
              demoMode
                ? "bg-demo text-demo-foreground"
                : "border border-border text-muted-foreground"
            }`}
          >
            {demoMode ? "DEMO MODE ON" : "Demo mode"}
          </button>
          {demoMode && (
            <button
              onClick={() => setDemoOpen((o) => !o)}
              className="rounded-full border border-demo px-2.5 py-1 font-medium text-demo"
            >
              Demo controls
            </button>
          )}
          <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
            Demo — not an emergency service
          </span>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-5">
        {/* Escalation card */}
        {turn?.escalate && escalationFact && (
          <section className="rounded-2xl border-2 border-destructive bg-destructive/15 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" />
              <h2 className="font-display text-lg font-bold">{turn.headline}</h2>
            </div>
            <a
              href={demoMode ? undefined : `tel:${escalationFact.number.replace(/\D/g, "")}`}
              onClick={(e) => {
                if (!demoMode) return;
                e.preventDefault();
                startSimCall(escalationFact.id, escalationFact.number);
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-4 font-display text-xl font-bold text-destructive-foreground"
            >
              <Phone className="size-5" /> Call {escalationFact.number}
              {demoMode && <span className="text-sm font-medium">(simulated)</span>}
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              {escalationFact.label} · from seeded critical facts, verified {FACTS_VERIFIED_ON} ·
              source {escalationFact.source}
            </p>
          </section>
        )}

        {/* Synthetic call in progress */}
        {simCall && (
          <section className="rounded-2xl border-2 border-demo bg-demo/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-demo opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-demo" />
                </span>
                <h2 className="font-display text-base font-bold">
                  {simCall.service} · {simCall.number}
                </h2>
              </div>
              <span className="rounded-full bg-demo px-2 py-0.5 text-[10px] font-bold uppercase text-demo-foreground">
                Simulated
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{simCall.status}</p>
            <div className="mt-3 space-y-2">
              {simCall.lines.slice(0, simStep + 1).map((l, i) => (
                <p key={i} className="rounded-xl bg-card p-3 text-sm italic">
                  “{l.text}”
                </p>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              {simStep < simCall.lines.length - 1 && (
                <button
                  onClick={advanceSimCall}
                  className="rounded-lg bg-demo px-3 py-2 text-xs font-bold text-demo-foreground"
                >
                  Continue call
                </button>
              )}
              <button
                onClick={() => setSimCall(null)}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
              >
                End call
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Synthetic demo call — no real service was contacted.
            </p>
          </section>
        )}

        {/* Simulated service connection */}
        {turn?.connect && (
          <section className="rounded-2xl border-2 border-demo bg-demo/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-demo opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-demo" />
                </span>
                <h2 className="font-display text-base font-bold">{turn.connect.service}</h2>
              </div>
              <span className="rounded-full bg-demo px-2 py-0.5 text-[10px] font-bold uppercase text-demo-foreground">
                Simulated
              </span>
            </div>
            {turn.connect.status && (
              <p className="mt-1 text-xs font-medium text-muted-foreground">{turn.connect.status}</p>
            )}
            {turn.connect.line && (
              <p className="mt-3 rounded-xl bg-card p-3 text-sm italic">“{turn.connect.line}”</p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Demo connection — no real service was contacted. Place the real call yourself.
            </p>
          </section>
        )}

        {/* Steps */}
        {turn && turn.steps.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-bold">
              {turn.escalate ? "Do this now" : turn.headline}
            </h2>
            <ol className="mt-3 space-y-2">
              {turn.steps.map((s, i) => (
                <li key={s} className="flex items-start gap-3">
                  <button
                    onClick={() => setDoneSteps((d) => (d.includes(i) ? d : [...d, i]))}
                    className="mt-0.5 shrink-0"
                    aria-label="Mark step done"
                  >
                    <CheckCircle2
                      className={`size-5 ${doneSteps.includes(i) ? "text-safe" : "text-muted-foreground/50"}`}
                    />
                  </button>
                  <span
                    className={`text-sm ${doneSteps.includes(i) ? "text-muted-foreground line-through" : ""}`}
                  >
                    {s}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void speak(turn.spoken)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium"
              >
                <Volume2 className="size-4" /> Repeat
              </button>
              <button
                onClick={() => void handleText("What should I do, I'm on the street")}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium"
              >
                <RefreshCw className="size-4" /> Situation changed
              </button>
              <button
                onClick={() => {
                  setTurn(null);
                  setPlaces([]);
                }}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
              >
                I&apos;m OK
              </button>
            </div>
          </section>
        )}

        {/* Map */}
        <section className="overflow-hidden rounded-2xl border border-border">
          <div className="h-64 w-full">
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-card" />}>
              <ClientOnly>
                <MapView
                  lat={loc.lat}
                  lon={loc.lon}
                  places={places}
                  polygon={activeAlert?.polygon ?? null}
                  routePath={directions?.route.path ?? []}
                />
              </ClientOnly>
            </Suspense>
          </div>
        </section>

        {/* Places */}
        {places.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-base font-bold">{turn?.find?.label}</h2>
            {places.map((p) => (
              <article key={p.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formatWalk(p.walkMin)} · {formatDistance(p.distanceM)}
                      {p.address && ` · ${p.address}`}
                      {p.openNow === true && " · open 24/7"}
                      {p.openingHours && p.openNow !== true && ` · ${p.openingHours}`}
                    </p>
                  </div>
                  <button
                    onClick={() => void showDirections(p)}
                    disabled={loadingDirections === p.id}
                    className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground"
                  >
                    {loadingDirections === p.id ? <Loader2 className="size-4 animate-spin" /> : "Directions"}
                  </button>
                </div>
                {directions?.place.id === p.id && (
                  <div className="mt-3 border-t border-border pt-3" aria-label={`Walking directions to ${p.name}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {formatWalk(directions.route.durationMin)} · {formatDistance(directions.route.distanceM)} walk
                      </p>
                      <button
                        onClick={() => setDirections(null)}
                        className="grid size-8 shrink-0 place-items-center rounded-lg border border-border"
                        aria-label="Close directions"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <ol className="mt-2 divide-y divide-border border-y border-border">
                      {directions.route.steps.map((step, index) => (
                        <li key={`${step.instruction}-${index}`} className="flex gap-3 py-2.5 text-sm">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                            {index + 1}
                          </span>
                          <span className="flex-1">{step.instruction}</span>
                          {step.distanceM > 0 && (
                            <span className="shrink-0 text-xs text-muted-foreground">{formatDistance(step.distanceM)}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-xs text-muted-foreground">Route: OpenStreetMap routing service</p>
                  </div>
                )}
              </article>
            ))}
            {placesSource && <p className="text-xs text-muted-foreground">Source: {placesSource}</p>}
          </section>
        )}


        {/* Transcript */}
        {messages.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Transcript
            </h2>
            {messages.slice(-6).map((m) => (
              <p key={m.id} className="text-sm">
                <span className="font-display font-bold text-accent">
                  {m.role === "you" ? "You" : "Concierge"}:{" "}
                </span>
                {m.text}
              </p>
            ))}
          </section>
        )}

        {/* What the concierge remembers */}
        {(memory.length > 0 || messages.length > 0) && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                What it remembers about you
              </h2>
              <button
                onClick={() => {
                  forgetAll();
                  setMemory([]);
                  setMessages([]);
                }}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
              >
                Forget me
              </button>
            </div>
            {memory.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                {memory.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Nothing learned yet — tell it about conditions, meds, or who you&apos;re with and it will
                carry that into later conversations.
              </p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">Kept on this device only.</p>
          </section>
        )}

        {/* Evidence */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Where this came from
          </h2>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>Alerts: National Weather Service api.weather.gov{checkedAt && ` · ${timeOf(checkedAt)}`}</li>
            <li>Places & map: OpenStreetMap / Overpass API</li>
            <li>
              Emergency numbers: seeded critical-facts table, verified {FACTS_VERIFIED_ON} — never
              generated
            </li>
            {turn && <li>This answer: {turn.provenance}</li>}
          </ul>
          <button
            onClick={versionTap}
            className="mt-3 text-[10px] text-muted-foreground/60"
            aria-label="Version"
          >
            v2.0 POC
          </button>
        </section>

        {error && (
          <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Demo panel */}
        {demoOpen && (
          <section className="rounded-2xl border-2 border-demo bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-demo">Demo controls</h2>
              <button onClick={() => setDemoOpen(false)} className="text-xs text-muted-foreground">
                Close
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => {
                  setDemoMode(e.target.checked);
                  if (!e.target.checked) setDemoAlert(null);
                }}
              />
              Demo mode (blocks real dialing)
            </label>
            <p className="mt-3 text-xs text-muted-foreground">Inject alert</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {(Object.keys(DEMO_ALERT_LABELS) as DemoAlertKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => injectDemo(k)}
                  className="rounded-lg bg-demo px-3 py-2 text-xs font-bold text-demo-foreground"
                >
                  {DEMO_ALERT_LABELS[k]}
                </button>
              ))}
              <button
                onClick={() => setDemoAlert(null)}
                className="rounded-lg border border-border px-3 py-2 text-xs"
              >
                Clear
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Location override</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setLoc({ lat: p.lat, lon: p.lon })}
                  className="rounded-lg border border-border px-3 py-2 text-xs"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Talk bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onPointerDown={() => void startTalk()}
            onPointerUp={() => void endTalk()}
            onPointerLeave={() => listening && void endTalk()}
            className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-xl font-display text-lg font-bold transition-colors ${
              listening
                ? "bg-accent text-accent-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {thinking ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Mic className="size-5" />
            )}
            {listening ? "Listening… release to send" : thinking ? "Working…" : "Hold to talk"}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleText(typed);
            setTyped("");
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="…or type what you need"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <button className="rounded-lg border border-border px-3 py-2 text-sm font-medium">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function PostureBadge({ posture }: { posture: Posture }) {
  const tone: Record<Posture, string> = {
    calm: "bg-safe text-safe-foreground",
    clarify: "bg-secondary text-secondary-foreground",
    shelter: "bg-accent text-accent-foreground",
    move: "bg-accent text-accent-foreground",
    "seek-help": "bg-destructive text-destructive-foreground",
  };
  return (
    <span className={`rounded-lg px-3 py-1.5 font-display text-xs font-bold tracking-wide ${tone[posture]}`}>
      {POSTURE_LABEL[posture]}
    </span>
  );
}

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-full w-full bg-card" />;
  return <>{children}</>;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
