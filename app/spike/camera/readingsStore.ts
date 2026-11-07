/** localStorage-backed list of saved readings, for useSyncExternalStore. */

import {
  parseStoredReadings,
  READINGS_STORAGE_KEY,
  type SpikeReading,
} from "@/lib/spike/readings";

const listeners = new Set<() => void>();
let cache: SpikeReading[] | null = null;

export const SERVER_READINGS: SpikeReading[] = [];

function load(): SpikeReading[] {
  try {
    return parseStoredReadings(localStorage.getItem(READINGS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function persistAndEmit(next: SpikeReading[]): void {
  cache = next;
  try {
    localStorage.setItem(READINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: keep the readings in memory for this page.
  }
  for (const listener of listeners) {
    listener();
  }
}

export function getReadings(): SpikeReading[] {
  cache ??= load();
  return cache;
}

export function getServerReadings(): SpikeReading[] {
  return SERVER_READINGS;
}

export function subscribeReadings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addReadings(readings: readonly SpikeReading[]): void {
  persistAndEmit([...getReadings(), ...readings]);
}

export function clearReadings(): void {
  persistAndEmit([]);
}
