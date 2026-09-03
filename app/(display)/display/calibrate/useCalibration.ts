"use client";

import { useSyncExternalStore } from "react";
import {
  isCalibrationStillValid,
  type Calibration,
  type CalibrationVerification,
  type DeviceContext,
  type ValidityResult,
} from "@/lib/calibration";

export const CALIBRATION_STORAGE_KEY = "vcp.calibration.v1";

type CalibrationSnapshot = {
  calibration: Calibration | null;
  deviceContext: DeviceContext | null;
};

const SERVER_SNAPSHOT: CalibrationSnapshot = {
  calibration: null,
  deviceContext: null,
};

const listeners = new Set<() => void>();
let cachedSnapshot: CalibrationSnapshot = SERVER_SNAPSHOT;
let clientInitialized = false;

function readDeviceContext(): DeviceContext {
  return {
    devicePixelRatio: window.devicePixelRatio,
    viewportWidthCssPx: window.innerWidth,
    viewportHeightCssPx: window.innerHeight,
    screenWidthCssPx: window.screen.width,
    screenHeightCssPx: window.screen.height,
    userAgent: navigator.userAgent,
  };
}

function isCalibrationRecord(value: unknown): value is Calibration {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.cssPxPerMm === "number" &&
    typeof record.cardWidthCssPx === "number" &&
    typeof record.devicePixelRatio === "number" &&
    typeof record.viewportWidthCssPx === "number" &&
    typeof record.viewportHeightCssPx === "number" &&
    typeof record.screenWidthCssPx === "number" &&
    typeof record.screenHeightCssPx === "number" &&
    typeof record.userAgent === "string" &&
    typeof record.createdAtIso === "string" &&
    record.method === "card-id1" &&
    Array.isArray(record.verifications)
  );
}

function readStoredCalibration(): Calibration | null {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isCalibrationRecord(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildSnapshot(): CalibrationSnapshot {
  return {
    calibration: readStoredCalibration(),
    deviceContext: readDeviceContext(),
  };
}

function emit(): void {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  function onStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== CALIBRATION_STORAGE_KEY) {
      return;
    }
    emit();
  }

  let mediaQueryList: MediaQueryList | null = null;

  function onResolutionChange(): void {
    if (mediaQueryList !== null) {
      mediaQueryList.removeEventListener("change", onResolutionChange);
    }
    emit();
    subscribeResolution();
  }

  function subscribeResolution(): void {
    mediaQueryList = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mediaQueryList.addEventListener("change", onResolutionChange);
  }

  window.addEventListener("storage", onStorage);
  subscribeResolution();

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    if (mediaQueryList !== null) {
      mediaQueryList.removeEventListener("change", onResolutionChange);
    }
  };
}

function getSnapshot(): CalibrationSnapshot {
  if (!clientInitialized) {
    cachedSnapshot = buildSnapshot();
    clientInitialized = true;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): CalibrationSnapshot {
  return SERVER_SNAPSHOT;
}

function save(next: Calibration): void {
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(next));
  emit();
}

function addVerification(verification: CalibrationVerification): void {
  const current = cachedSnapshot.calibration;
  if (current === null) {
    return;
  }
  const next: Calibration = {
    ...current,
    verifications: [...current.verifications, verification],
  };
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(next));
  emit();
}

function removeVerification(createdAtIso: string): void {
  const current = cachedSnapshot.calibration;
  if (current === null) {
    return;
  }
  const next: Calibration = {
    ...current,
    verifications: current.verifications.filter((entry) => entry.createdAtIso !== createdAtIso),
  };
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(next));
  emit();
}

function clear(): void {
  localStorage.removeItem(CALIBRATION_STORAGE_KEY);
  emit();
}

export type UseCalibrationResult = {
  ready: boolean;
  calibration: Calibration | null;
  deviceContext: DeviceContext | null;
  validity: ValidityResult | null;
  save: (next: Calibration) => void;
  addVerification: (verification: CalibrationVerification) => void;
  removeVerification: (createdAtIso: string) => void;
  clear: () => void;
};

export function useCalibration(): UseCalibrationResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const validity =
    snapshot.calibration === null || snapshot.deviceContext === null
      ? null
      : isCalibrationStillValid(snapshot.calibration, snapshot.deviceContext);

  return {
    ready: snapshot.deviceContext !== null,
    calibration: snapshot.calibration,
    deviceContext: snapshot.deviceContext,
    validity,
    save,
    addVerification,
    removeVerification,
    clear,
  };
}
