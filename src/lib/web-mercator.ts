/**
 * Shared Web Mercator helpers for the Alps wave basemap (build script + runtime).
 * Tile Y increases southward; lat → mercator Y (not linear latitude).
 */

export type LonLatBbox = {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
};

/** Projection parameters for overlaying lon/lat on a cropped basemap image. */
export type BasemapProjection = {
  z: number;
  tilePx: number;
  /** Fractional tile X of image pixel (0,0) after integer crop rounding. */
  originX: number;
  /** Fractional tile Y of image pixel (0,0) after integer crop rounding. */
  originY: number;
  width: number;
  height: number;
};

/** Full crop recipe for stitching a mosaic then extracting the bbox. */
export type BasemapCropSpec = BasemapProjection & {
  cropLeft: number;
  cropTop: number;
  mosaicX0: number;
  mosaicY0: number;
  mosaicW: number;
  mosaicH: number;
};

/** Continuous mercator tile coordinates (not floored). */
export function lonLatToTileFract(
  lat: number,
  lon: number,
  z: number,
): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Integer tile indices that intersect the bbox at zoom z. */
export function tilesIntersectingBbox(
  bbox: LonLatBbox,
  z: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const nw = lonLatToTileFract(bbox.lamax, bbox.lomin, z);
  const se = lonLatToTileFract(bbox.lamin, bbox.lomax, z);
  return {
    x0: Math.floor(nw.x),
    y0: Math.floor(nw.y),
    x1: Math.floor(se.x),
    y1: Math.floor(se.y),
  };
}

/**
 * Pixel size and origin for a basemap covering `bbox` at zoom `z`.
 *
 * Uses the same integer crop rounding as `scripts/build-wave-basemap.ts`:
 * mosaic whole tiles, then extract the bbox rectangle so pixel (0,0) matches
 * `originX/Y` (sharp cannot place tiles at negative offsets).
 */
export function basemapProjectionForBbox(
  bbox: LonLatBbox,
  z: number,
  tilePx: number,
): BasemapCropSpec {
  const nw = lonLatToTileFract(bbox.lamax, bbox.lomin, z);
  const se = lonLatToTileFract(bbox.lamin, bbox.lomax, z);
  const { x0, y0, x1, y1 } = tilesIntersectingBbox(bbox, z);

  const worldLeft = nw.x * tilePx;
  const worldTop = nw.y * tilePx;
  const worldRight = se.x * tilePx;
  const worldBottom = se.y * tilePx;

  const mosaicOriginX = x0 * tilePx;
  const mosaicOriginY = y0 * tilePx;
  const mosaicW = (x1 - x0 + 1) * tilePx;
  const mosaicH = (y1 - y0 + 1) * tilePx;

  const cropLeft = Math.round(worldLeft - mosaicOriginX);
  const cropTop = Math.round(worldTop - mosaicOriginY);
  const width = Math.round(worldRight - worldLeft);
  const height = Math.round(worldBottom - worldTop);

  return {
    z,
    tilePx,
    originX: (mosaicOriginX + cropLeft) / tilePx,
    originY: (mosaicOriginY + cropTop) / tilePx,
    width,
    height,
    cropLeft,
    cropTop,
    mosaicX0: x0,
    mosaicY0: y0,
    mosaicW,
    mosaicH,
  };
}

/** Project lon/lat into basemap image pixels (origin = image NW after crop). */
export function projectLonLat(
  lon: number,
  lat: number,
  proj: Pick<BasemapProjection, "originX" | "originY" | "tilePx" | "z">,
): { x: number; y: number } {
  const t = lonLatToTileFract(lat, lon, proj.z);
  return {
    x: (t.x - proj.originX) * proj.tilePx,
    y: (t.y - proj.originY) * proj.tilePx,
  };
}
