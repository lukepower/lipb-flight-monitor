/** Alps / Tyrol wave/shear maps: static OpenTopoMap basemap + Web Mercator. */

import { ALPS_BBOX, WAVE_RISK_BBOX } from "@/lib/constants";
import basemapMeta from "@/lib/wave-basemap-meta.json";
import tyrolBasemapMeta from "@/lib/tyrol-basemap-meta.json";
import {
  basemapProjectionForBbox,
  projectLonLat,
  type BasemapProjection,
  type LonLatBbox,
} from "@/lib/web-mercator";

export const WAVE_BASEMAP_ZOOM = basemapMeta.z as number;
export const WAVE_TILE_PX = basemapMeta.tilePx as number;
export const TYROL_BASEMAP_ZOOM = tyrolBasemapMeta.z as number;

export const WAVE_MAP_ATTRIBUTION = basemapMeta.attribution as string;

/** Committed static basemap for the fixed Alps bbox (no live tile fetches). */
export const WAVE_BASEMAP_STATIC_URL = basemapMeta.staticUrl as string;
export const TYROL_BASEMAP_STATIC_URL = tyrolBasemapMeta.staticUrl as string;

export type WaveBasemapTile = {
  z: number;
  x: number;
  y: number;
  url: string;
  px: number;
  py: number;
};

export type WaveBasemap = BasemapProjection & {
  bbox: LonLatBbox;
  staticUrl: string | null;
  tiles: WaveBasemapTile[];
  attribution: string;
};

/** Sidecar meta committed next to the JPG (bbox + projection). */
export function waveBasemapMetaFromSidecar(): {
  bbox: LonLatBbox;
  projection: BasemapProjection;
  staticUrl: string;
  attribution: string;
} {
  return {
    bbox: basemapMeta.bbox as LonLatBbox,
    projection: {
      z: basemapMeta.z,
      tilePx: basemapMeta.tilePx,
      originX: basemapMeta.originX,
      originY: basemapMeta.originY,
      width: basemapMeta.width,
      height: basemapMeta.height,
    },
    staticUrl: basemapMeta.staticUrl,
    attribution: basemapMeta.attribution,
  };
}

function metaMatches(
  meta: {
    bbox: LonLatBbox;
    projection: BasemapProjection;
    staticUrl: string;
    attribution: string;
  },
  bbox: LonLatBbox,
  z: number,
): boolean {
  return (
    Math.abs(bbox.lamin - meta.bbox.lamin) < 1e-9 &&
    Math.abs(bbox.lamax - meta.bbox.lamax) < 1e-9 &&
    Math.abs(bbox.lomin - meta.bbox.lomin) < 1e-9 &&
    Math.abs(bbox.lomax - meta.bbox.lomax) < 1e-9 &&
    z === meta.projection.z
  );
}

/**
 * Canvas matching the committed static OpenTopoMap mosaic for `ALPS_BBOX`.
 * Rebuild via `npm run build:wave-basemap` if the bbox changes.
 */
export function buildWaveBasemap(
  bbox: LonLatBbox = ALPS_BBOX,
  z: number = WAVE_BASEMAP_ZOOM,
): WaveBasemap {
  const meta = waveBasemapMetaFromSidecar();
  const sameBbox = metaMatches(meta, bbox, z);
  const live = basemapProjectionForBbox(bbox, z, WAVE_TILE_PX);
  const proj: BasemapProjection = sameBbox ? meta.projection : live;

  return {
    ...live,
    ...proj,
    bbox: sameBbox ? meta.bbox : bbox,
    staticUrl: sameBbox ? meta.staticUrl : null,
    tiles: [],
    attribution: meta.attribution,
  };
}

export function tyrolBasemapMetaFromSidecar(): {
  bbox: LonLatBbox;
  projection: BasemapProjection;
  staticUrl: string;
  attribution: string;
} {
  return {
    bbox: tyrolBasemapMeta.bbox as LonLatBbox,
    projection: {
      z: tyrolBasemapMeta.z,
      tilePx: tyrolBasemapMeta.tilePx,
      originX: tyrolBasemapMeta.originX,
      originY: tyrolBasemapMeta.originY,
      width: tyrolBasemapMeta.width,
      height: tyrolBasemapMeta.height,
    },
    staticUrl: tyrolBasemapMeta.staticUrl,
    attribution: tyrolBasemapMeta.attribution,
  };
}

/** Higher-res Tyrol / WAVE_RISK_BBOX basemap for mobile default view. */
export function buildTyrolBasemap(
  bbox: LonLatBbox = WAVE_RISK_BBOX,
  z: number = TYROL_BASEMAP_ZOOM,
): WaveBasemap {
  const meta = tyrolBasemapMetaFromSidecar();
  const sameBbox = metaMatches(meta, bbox, z);
  const live = basemapProjectionForBbox(bbox, z, WAVE_TILE_PX);
  const proj: BasemapProjection = sameBbox ? meta.projection : live;

  return {
    ...live,
    ...proj,
    bbox: sameBbox ? meta.bbox : bbox,
    staticUrl: sameBbox ? meta.staticUrl : null,
    tiles: [],
    attribution: meta.attribution,
  };
}

const DEFAULT_BASEMAP = buildWaveBasemap();

export const WAVE_MAP_W = DEFAULT_BASEMAP.width;
export const WAVE_MAP_H = DEFAULT_BASEMAP.height;

/**
 * Project lon/lat into the Alps basemap canvas (Web Mercator Y, not linear lat).
 * Shared math with `scripts/build-wave-basemap.ts` via {@link projectLonLat}.
 */
export function projectWaveLonLat(
  lon: number,
  lat: number,
  basemap: WaveBasemap = DEFAULT_BASEMAP,
): { x: number; y: number } {
  return projectLonLat(lon, lat, basemap);
}
