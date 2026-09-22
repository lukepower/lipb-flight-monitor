"use client";

import {
  CloudSun,
  Pause,
  Play,
  Radar,
  Satellite,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import { LIPB } from "@/lib/constants";
import { latLonToTile, type RadarBundle } from "@/lib/radar";
import { lipbMarkerInBbox, type SatelliteBundle } from "@/lib/satellite";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

type Mode = "radar" | "satellite";

const FRAME_MS = 450;

function markerInTile(
  lat: number,
  lon: number,
  z: number,
): { leftPct: number; topPct: number } {
  const n = 2 ** z;
  const { x, y } = latLonToTile(lat, lon, z);
  const fx = ((lon + 180) / 360) * n - x;
  const latRad = (lat * Math.PI) / 180;
  const fy =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n -
    y;
  return { leftPct: fx * 100, topPct: fy * 100 };
}

export function WxImagery({
  radar,
  satellite,
}: {
  radar: RadarBundle;
  satellite: SatelliteBundle;
}) {
  const radarOk = radar.frames.length > 0;
  const satOk = satellite.frames.length > 0;
  const [mode, setMode] = useState<Mode>(radarOk ? "radar" : "satellite");
  const frames = mode === "radar" ? radar.frames : satellite.frames;
  const [index, setIndex] = useState(() =>
    Math.max(0, (radarOk ? radar.frames : satellite.frames).length - 1),
  );
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function selectMode(next: Mode) {
    const nextFrames = next === "radar" ? radar.frames : satellite.frames;
    setMode(next);
    setIndex(Math.max(0, nextFrames.length - 1));
  }

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    timer.current = setTimeout(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, FRAME_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, index, frames.length]);

  useEffect(() => {
    for (const f of frames) {
      const img = new Image();
      img.src = f.url;
    }
  }, [frames]);

  if (!radarOk && !satOk) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> Sky imagery
        </SectionKicker>
        <p className="mt-3 text-sm text-[#f3efe4]">
          Radar and satellite unavailable
          {radar.error || satellite.error
            ? `: ${radar.error ?? satellite.error}`
            : ""}
        </p>
      </Panel>
    );
  }

  const frame = frames[index] ?? null;
  const timeLabel = frame
    ? formatLocalHm(new Date(frame.timeIso))
    : "—";
  const attribution =
    mode === "radar" ? radar.attribution : satellite.attribution;
  const radarMarker = markerInTile(LIPB.lat, LIPB.lon, radar.tile.z);
  const satMarker = lipbMarkerInBbox();

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <CloudSun className="size-3.5" /> Sky imagery
        </SectionKicker>
        <Badge className="bg-white/12 text-[#f3efe4]">LIPB area</Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          {mode === "radar"
            ? "Radar · last ~2 h · 10 min"
            : `Sat · last ~1 h · ${satellite.layerLabel ?? "MTG"}`}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-white/10 bg-black/25 p-1">
          <ModeButton
            active={mode === "radar"}
            disabled={!radarOk}
            onClick={() => selectMode("radar")}
            icon={Radar}
            label="Radar"
          />
          <ModeButton
            active={mode === "satellite"}
            disabled={!satOk}
            onClick={() => selectMode("satellite")}
            icon={Satellite}
            label="Satellite"
          />
        </div>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          disabled={frames.length < 2}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-[#f3efe4]/90 hover:bg-white/8 disabled:opacity-40"
        >
          {playing ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {playing ? "Pause" : "Play"}
        </button>
        <span className="font-mono text-sm text-emerald-100/90">{timeLabel}</span>
        <span className="text-xs text-[#d7d2c4]/45">local</span>
      </div>

      <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/10 bg-[#0b1210]">
        {mode === "radar" && radar.basemapUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={radar.basemapUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
        {frame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={frame.url}
            src={frame.url}
            alt={mode === "radar" ? "Weather radar" : "Satellite imagery"}
            className={cn(
              "absolute inset-0 h-full w-full",
              mode === "radar" ? "object-cover" : "object-contain bg-black",
            )}
            draggable={false}
          />
        ) : null}
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${mode === "radar" ? radarMarker.leftPct : satMarker.leftPct}%`,
            top: `${mode === "radar" ? radarMarker.topPct : satMarker.topPct}%`,
          }}
        >
          <div className="relative flex flex-col items-center">
            <span className="size-2.5 rounded-full border-2 border-emerald-300 bg-emerald-300/30 shadow-[0_0_12px_oklch(0.86_0.14_155/0.7)]" />
            <span className="mt-1 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-emerald-100">
              {LIPB.icao}
            </span>
          </div>
        </div>
      </div>

      {frames.length > 1 ? (
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          className="mt-3 w-full accent-emerald-300"
          aria-label="Frame scrubber"
        />
      ) : null}

      <p className="mt-3 text-[11px] text-[#d7d2c4]/45">
        {attribution}
        {mode === "radar" ? (
          <>
            {" · "}
            <a
              href="https://www.rainviewer.com/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 hover:text-[#f3efe4]/70"
            >
              rainviewer.com
            </a>
          </>
        ) : (
          <>
            {" · "}
            <a
              href="https://view.eumetsat.int/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 hover:text-[#f3efe4]/70"
            >
              EUMETView
            </a>
          </>
        )}
      </p>
    </Panel>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof Radar;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-35",
        active
          ? "bg-emerald-300 text-[#10211c]"
          : "text-[#f3efe4]/80 hover:bg-white/8",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
