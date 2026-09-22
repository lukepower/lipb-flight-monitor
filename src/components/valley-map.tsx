"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { LiveTrack } from "@/lib/opensky";
import {
  MAP_ATTRIBUTION,
  MAP_HEIGHT,
  MAP_WIDTH,
  featuresByLayer,
  fetchValleyMap,
  linePath,
  projectLonLat,
  ringPath,
  runwayPolygon,
  trackKey,
  updateTrails,
  type TrailPoint,
  type ValleyFeature,
  type ValleyFeatureCollection,
} from "@/lib/valley-map";

function LayerPaths({
  fc,
  layer,
  className,
  strokeWidth,
  fill,
}: {
  fc: ValleyFeatureCollection;
  layer: ValleyFeature["properties"]["layer"];
  className?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <>
      {featuresByLayer(fc, layer).map((f, i) => {
        const key = `${layer}-${i}`;
        if (f.geometry.type === "LineString") {
          return (
            <path
              key={key}
              d={linePath(f.geometry.coordinates)}
              className={className}
              fill="none"
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (f.geometry.type === "Polygon") {
          return (
            <path
              key={key}
              d={ringPath(f.geometry.coordinates[0] ?? [])}
              className={className}
              fill={fill}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        return null;
      })}
    </>
  );
}

function RunwayLayer({ fc }: { fc: ValleyFeatureCollection }) {
  return (
    <>
      {featuresByLayer(fc, "runway").map((f, i) => {
        if (f.geometry.type !== "LineString") return null;
        // Exaggerate width so the 01/19 strip stays readable at valley scale.
        const poly = runwayPolygon(f.geometry.coordinates, 220);
        if (!poly) return null;
        return (
          <path
            key={`runway-${i}`}
            d={ringPath(poly)}
            className="fill-[#e8e2d4] stroke-[#e8e2d4]/80"
            strokeWidth={0.5}
          />
        );
      })}
    </>
  );
}

function Labels({ fc }: { fc: ValleyFeatureCollection }) {
  return (
    <>
      {featuresByLayer(fc, "label").map((f, i) => {
        if (f.geometry.type !== "Point") return null;
        const [lon, lat] = f.geometry.coordinates;
        const { x, y } = projectLonLat(lon, lat);
        const isAirport = f.properties.kind === "airport";
        return (
          <text
            key={`label-${i}`}
            x={x}
            y={isAirport ? y - 10 : y}
            textAnchor="middle"
            className={
              isAirport
                ? "fill-emerald-200/90 text-[11px] font-semibold tracking-wide"
                : "fill-[#d7d2c4]/70 text-[10px] font-medium"
            }
            style={{ fontSize: isAirport ? 12 : 10 }}
          >
            {f.properties.name}
          </text>
        );
      })}
    </>
  );
}

function trackDetail(track: LiveTrack): string {
  if (track.onGround) return "on ground";
  const alt =
    track.altitudeFt != null ? `${track.altitudeFt.toLocaleString()} ft` : "? ft";
  const spd =
    track.velocityKt != null ? `${track.velocityKt} kt` : "? kt";
  return `${alt} · ${spd}`;
}

function AircraftTrail({
  id,
  points,
}: {
  id: string;
  points: TrailPoint[];
}) {
  if (points.length < 2) return null;
  return (
    <path
      key={`trail-${id}`}
      d={linePath(points)}
      className="stroke-emerald-300/45"
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function AircraftMarker({ track }: { track: LiveTrack }) {
  const { x, y } = projectLonLat(track.lon, track.lat);
  const rot = track.trackDeg ?? 0;
  const fill = track.onGround ? "#fbbf24" : "#6ee7b7";
  const detail = trackDetail(track);

  return (
    <motion.g
      initial={{ opacity: 0, x, y }}
      animate={{ opacity: 1, x, y }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <title>
        {track.callsign} · {detail}
      </title>
      {track.onGround ? (
        <rect
          x={-7}
          y={-7}
          width={14}
          height={14}
          rx={2}
          fill={fill}
          stroke="#10211c"
          strokeWidth={1.25}
        />
      ) : (
        <g transform={`rotate(${rot})`}>
          <path
            d="M0,-14 L8,12 L0,6 L-8,12 Z"
            fill={fill}
            stroke="#10211c"
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
        </g>
      )}
      <text
        x={12}
        y={-2}
        className="fill-[#f6f1e6] font-mono font-semibold"
        style={{
          fontSize: 11,
          paintOrder: "stroke",
          stroke: "#0c1a16",
          strokeWidth: 3,
          strokeLinejoin: "round",
        }}
      >
        {track.callsign}
        <tspan
          x={12}
          dy={13}
          className="fill-[#d7d2c4] font-medium"
          style={{ fontSize: 10 }}
        >
          {detail}
        </tspan>
      </text>
    </motion.g>
  );
}

export function ValleyMap({ tracks }: { tracks: LiveTrack[] }) {
  const [fc, setFc] = useState<ValleyFeatureCollection | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [trails, setTrails] = useState<Record<string, TrailPoint[]>>({});

  useEffect(() => {
    let cancelled = false;
    void fetchValleyMap()
      .then((geo) => {
        if (!cancelled) setFc(geo);
      })
      .catch((e) => {
        if (!cancelled) {
          setMapError(e instanceof Error ? e.message : "Map unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTrails((prev) => updateTrails(prev, tracks));
  }, [tracks]);

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-white/8 bg-[#0c1a16]">
      <div className="mx-auto w-full max-w-[360px] sm:max-w-[400px]">
        {!fc ? (
          <div
            className="flex aspect-[3/5] items-center justify-center px-4 text-center font-mono text-xs text-[#d7d2c4]/55"
            role="status"
          >
            {mapError ? `Map unavailable (${mapError})` : "Loading valley map…"}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Valle Adige map with live ADS-B aircraft"
          >
            <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="fill-[#0c1a16]" />
            <rect
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              className="fill-[#132821]/80"
            />
            <LayerPaths
              fc={fc}
              layer="urban"
              className="fill-[#1a322b] stroke-none"
              fill="#1a322b"
            />
            <LayerPaths
              fc={fc}
              layer="river"
              className="stroke-sky-400/55"
              strokeWidth={2.2}
            />
            <LayerPaths
              fc={fc}
              layer="motorway"
              className="stroke-[#d7d2c4]/35"
              strokeWidth={1.4}
            />
            <LayerPaths
              fc={fc}
              layer="apron"
              className="fill-[#2a3d36] stroke-[#d7d2c4]/20"
              fill="#2a3d36"
              strokeWidth={0.6}
            />
            <LayerPaths
              fc={fc}
              layer="taxiway"
              className="stroke-[#d7d2c4]/45"
              strokeWidth={1}
            />
            <RunwayLayer fc={fc} />
            <LayerPaths
              fc={fc}
              layer="atz"
              className="stroke-emerald-300/45"
              strokeWidth={1.2}
            />
            <Labels fc={fc} />
            {Object.entries(trails).map(([id, points]) => (
              <AircraftTrail key={id} id={id} points={points} />
            ))}
            {tracks.map((t, i) => (
              <AircraftMarker key={trackKey(t, i)} track={t} />
            ))}
          </svg>
        )}
      </div>
      <p className="border-t border-white/6 px-3 py-1.5 font-mono text-[10px] text-[#d7d2c4]/40">
        {MAP_ATTRIBUTION} · simplified extract · not for navigation
        {tracks.length > 0
          ? ` · ${tracks.length} track${tracks.length === 1 ? "" : "s"}`
          : ""}
      </p>
    </div>
  );
}
