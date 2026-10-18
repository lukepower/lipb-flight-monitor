/** Alps wave/shear map: OpenTopoMap basemap + Web Mercator projection. */

import { ALPS_BBOX } from "@/lib/constants";
import { latLonToTileFract } from "@/lib/radar";

export const WAVE_BASEMAP_ZOOM = 7;
export const WAVE_TILE_PX = 256;

export const WAVE_MAP_ATTRIBUTION =
  "Map © OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors · SRTM";

export type WaveBasemapTile = {
  z: number;
  x: number;
  y: number;
  url: string;
  /** Pixel position of the tile's NW corner in the map canvas. */
  px: number;
  py: number;
};

export type WaveBasemap = {
  z: number;
  width: number;
  height: number;
  /** Fractional tile coords of the map NW corner (ALPS_BBOX NW). */
  originX: number;
  originY: number;
  tiles: WaveBasemapTile[];
  attribution: string;
};

function openTopoTileUrl(z: number, x: number, y: number): string {
  const host = ["a", "b", "c"][(Math.abs(x + y) % 3) as 0 | 1 | 2]!;
  return `https://${host}.tile.opentopomap.org/${z}/${x}/${y}.png`;
}

/**
 * Build an OpenTopoMap mosaic covering `ALPS_BBOX` at {@link WAVE_BASEMAP_ZOOM}.
 * Canvas size is the mercator span of the bbox in CSS pixels (256 px / tile).
 */
export function buildWaveBasemap(
  bbox: {
    lamin: number;
    lamax: number;
    lomin: number;
    lomax: number;
  } = ALPS_BBOX,
  z: number = WAVE_BASEMAP_ZOOM,
): WaveBasemap {
  const nw = latLonToTileFract(bbox.lamax, bbox.lomin, z);
  const se = latLonToTileFract(bbox.lamin, bbox.lomax, z);
  const originX = nw.x;
  const originY = nw.y;
  const width = (se.x - nw.x) * WAVE_TILE_PX;
  const height = (se.y - nw.y) * WAVE_TILE_PX;

  const x0 = Math.floor(nw.x);
  const y0 = Math.floor(nw.y);
  const x1 = Math.floor(se.x);
  const y1 = Math.floor(se.y);

  const tiles: WaveBasemapTile[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      tiles.push({
        z,
        x,
        y,
        url: openTopoTileUrl(z, x, y),
        px: (x - originX) * WAVE_TILE_PX,
        py: (y - originY) * WAVE_TILE_PX,
      });
    }
  }

  return {
    z,
    width,
    height,
    originX,
    originY,
    tiles,
    attribution: WAVE_MAP_ATTRIBUTION,
  };
}

const DEFAULT_BASEMAP = buildWaveBasemap();

/** Default canvas size for the Alps wave map (from OpenTopo mosaic). */
export const WAVE_MAP_W = DEFAULT_BASEMAP.width;
export const WAVE_MAP_H = DEFAULT_BASEMAP.height;

/** Project lon/lat into the Alps basemap canvas (Web Mercator). */
export function projectWaveLonLat(
  lon: number,
  lat: number,
  basemap: WaveBasemap = DEFAULT_BASEMAP,
): { x: number; y: number } {
  const t = latLonToTileFract(lat, lon, basemap.z);
  return {
    x: (t.x - basemap.originX) * WAVE_TILE_PX,
    y: (t.y - basemap.originY) * WAVE_TILE_PX,
  };
}
