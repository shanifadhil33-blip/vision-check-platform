/** Saved camera-spike readings and their one-tap text form. Pure. */

export const READINGS_HEADER = "spike-camera-1";
export const READINGS_STORAGE_KEY = "vcp-spike-camera-readings-v1";

export type SpikeMetric = "single-raw" | "single-refined" | "corner-raw" | "corner-refined";

export type SpikeReading = {
  savedAtIso: string;
  mode: "centre" | "corners" | "both" | "none";
  metric: SpikeMetric;
  trueDistanceMm: number;
  meanCameraPx: number;
  sdPercent: number;
  frames: number;
  framesPerSecond: number;
  baselineDistanceMm: number | null;
  baselineCameraPx: number | null;
  ratio: number | null;
  estimatedDistanceMm: number | null;
  errorMm: number | null;
  resolution: string;
  zoom: string;
  detectionScale: number;
  note: string;
};

function fixed(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

export function readingLine(reading: SpikeReading): string {
  return [
    `time=${reading.savedAtIso}`,
    `mode=${reading.mode}`,
    `metric=${reading.metric}`,
    `trueMm=${fixed(reading.trueDistanceMm, 0)}`,
    `meanPx=${fixed(reading.meanCameraPx, 3)}`,
    `sdPct=${fixed(reading.sdPercent, 3)}`,
    `frames=${reading.frames}`,
    `fps=${fixed(reading.framesPerSecond, 1)}`,
    `baselineMm=${fixed(reading.baselineDistanceMm, 0)}`,
    `baselinePx=${fixed(reading.baselineCameraPx, 3)}`,
    `ratio=${fixed(reading.ratio, 5)}`,
    `estMm=${fixed(reading.estimatedDistanceMm, 1)}`,
    `errMm=${fixed(reading.errorMm, 1)}`,
    `res=${reading.resolution}`,
    `zoom=${reading.zoom}`,
    `detScale=${reading.detectionScale}`,
    `note=${JSON.stringify(reading.note)}`,
  ].join(" ");
}

export function readingsText(readings: readonly SpikeReading[]): string {
  return [READINGS_HEADER, ...readings.map(readingLine)].join("\n");
}

function isReading(value: unknown): value is SpikeReading {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.savedAtIso === "string" &&
    typeof record.metric === "string" &&
    typeof record.trueDistanceMm === "number" &&
    typeof record.meanCameraPx === "number"
  );
}

export function parseStoredReadings(raw: string | null): SpikeReading[] {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isReading) : [];
  } catch {
    return [];
  }
}
