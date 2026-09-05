"use client";

import { motion } from "motion/react";
import type { LiveTrack } from "@/lib/opensky";
import {
  MAP_ATTRIBUTION,
  MAP_HEIGHT,
  MAP_WIDTH,
  featuresByLayer,
  linePath,
  loadValleyMap,
  projectLonLat,
  ringPath,
  runwayPolygon,
  type ValleyFeature,
} from "@/lib/valley-map";

const fc = loadValleyMap();

function LayerPaths({
  layer,
  className,
  strokeWidth,
  fill,
}: {
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

function RunwayLayer() {
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

function Labels() {
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

function AircraftMarker({ track }: { track: LiveTrack }) {
  const { x, y } = projectLonLat(track.lon, track.lat);
  const rot = track.trackDeg ?? 0;
  const fill = track.onGround ? "#fbbf24" : "#6ee7b7";
  const label =
    track.onGround
      ? "on ground"
      : `${track.altitudeFt?.toLocaleString() ?? "?"} ft`;

  return (
    <motion.g
      initial={{ opacity: 0, x, y }}
      animate={{ opacity: 1, x, y }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <title>
        {track.callsign} · {label}
        {track.velocityKt != null ? ` · ${track.velocityKt} kt` : ""}
      </title>
      {track.onGround ? (
        <rect
          x={-5}
          y={-5}
          width={10}
          height={10}
          rx={1.5}
          fill={fill}
          stroke="#10211c"
          strokeWidth={1}
        />
      ) : (
        <g transform={`rotate(${rot})`}>
          <path
            d="M0,-9 L5,8 L0,4 L-5,8 Z"
            fill={fill}
            stroke="#10211c"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </g>
      )}
      <text
        x={8}
        y={3}
        className="fill-[#f6f1e6] font-mono text-[9px] font-semibold"
        style={{ fontSize: 9 }}
      >
        {track.callsign}
      </text>
    </motion.g>
  );
}

export function ValleyMap({ tracks }: { tracks: LiveTrack[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-white/8 bg-[#0c1a16]">
      <div className="mx-auto w-full max-w-[360px] sm:max-w-[400px]">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label="Valle Adige map with live ADS-B aircraft"
      >
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="fill-[#0c1a16]" />
        {/* Soft terrain wash */}
        <rect
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          className="fill-[#132821]/80"
        />
        <LayerPaths layer="urban" className="fill-[#1a322b] stroke-none" fill="#1a322b" />
        <LayerPaths
          layer="river"
          className="stroke-sky-400/55"
          strokeWidth={2.2}
        />
        <LayerPaths
          layer="motorway"
          className="stroke-[#d7d2c4]/35"
          strokeWidth={1.4}
        />
        <LayerPaths
          layer="apron"
          className="fill-[#2a3d36] stroke-[#d7d2c4]/20"
          fill="#2a3d36"
          strokeWidth={0.6}
        />
        <LayerPaths
          layer="taxiway"
          className="stroke-[#d7d2c4]/45"
          strokeWidth={1}
        />
        <RunwayLayer />
        <LayerPaths
          layer="atz"
          className="stroke-emerald-300/45"
          strokeWidth={1.2}
        />
        <Labels />
        {tracks.map((t) => (
          <AircraftMarker key={t.icao24 || t.callsign} track={t} />
        ))}
      </svg>
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
