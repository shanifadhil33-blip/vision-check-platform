"use client";

/**
 * Main-screen views for movement detection. Loaded lazily by TestClient only
 * while the snapshot carries a movement view, which it never does with the
 * switch off. The marker cells come from constants, not from js-aruco2.
 */

import { useEffect, useRef, type ReactNode } from "react";
import {
  MAIN_PAUSE_LOST_BODY,
  MAIN_PAUSE_LOST_TITLE,
  MAIN_PAUSE_MOVED_TITLE,
  MAIN_WAITING_FOR_CAMERA,
  mainPauseMovedBody,
} from "@/lib/movement/wording";
import { MARKER_CELLS_ACROSS, MOVEMENT_MARKER_BITS } from "@/lib/movement/vision/markerCells";
import type { MarkerSlot } from "@/lib/movement/markerSlot";
import type { DisplayMovementView } from "./displayMovement";

/** Draws in device pixels: every rect starts and ends on a whole device pixel. */
function MarkerCanvas({ slot, devicePixelRatio }: { slot: MarkerSlot; devicePixelRatio: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quietDevicePx = slot.quietZoneDevicePx;
  const canvasDevicePx = slot.sideDevicePx + 2 * quietDevicePx;
  const canvasCssPx = canvasDevicePx / devicePixelRatio;
  const leftCssPx = (slot.leftDevicePx - quietDevicePx) / devicePixelRatio;
  const topCssPx = (slot.topDevicePx - quietDevicePx) / devicePixelRatio;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    canvas.width = canvasDevicePx;
    canvas.height = canvasDevicePx;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasDevicePx, canvasDevicePx);
    ctx.fillStyle = "#000000";
    ctx.fillRect(quietDevicePx, quietDevicePx, slot.sideDevicePx, slot.sideDevicePx);
    ctx.fillStyle = "#ffffff";
    const dataCells = MARKER_CELLS_ACROSS - 2;
    for (let row = 0; row < dataCells; row += 1) {
      for (let col = 0; col < dataCells; col += 1) {
        if (MOVEMENT_MARKER_BITS[row * dataCells + col] === "1") {
          ctx.fillRect(
            quietDevicePx + (col + 1) * slot.cellDevicePx,
            quietDevicePx + (row + 1) * slot.cellDevicePx,
            slot.cellDevicePx,
            slot.cellDevicePx,
          );
        }
      }
    }
  }, [canvasDevicePx, quietDevicePx, slot.cellDevicePx, slot.sideDevicePx]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        left: `${leftCssPx}px`,
        top: `${topCssPx}px`,
        width: `${canvasCssPx}px`,
        height: `${canvasCssPx}px`,
        display: "block",
      }}
    />
  );
}

type FrameProps = {
  view: DisplayMovementView;
  devicePixelRatio: number;
  /** content: left of the marker; window: the whole window, marker hidden. */
  area: "content" | "window";
  background: "page" | "white";
  children?: ReactNode;
};

function MovementFrame({ view, devicePixelRatio, area, background, children }: FrameProps) {
  const backgroundClass = background === "white" ? "bg-white" : "bg-neutral-950";
  return (
    <div className={`fixed inset-0 overflow-hidden ${backgroundClass}`}>
      <div
        className="absolute top-0 bottom-0 left-0 flex items-center justify-center overflow-y-auto"
        style={{ width: area === "content" ? `${view.slot.contentWidthCssPx}px` : "100%" }}
      >
        {children}
      </div>
      {area === "content" && <MarkerCanvas slot={view.slot} devicePixelRatio={devicePixelRatio} />}
    </div>
  );
}

function HoldText({ title, body }: { title: string | null; body: string }) {
  return (
    <div role="status" aria-live="polite" className="flex max-w-3xl flex-col items-center gap-8 px-8 text-center">
      {title !== null && <p className="text-6xl leading-tight font-semibold text-neutral-100">{title}</p>}
      <p className="text-4xl leading-snug text-neutral-200">{body}</p>
    </div>
  );
}

export type MovementScreenProps =
  | { kind: "frame"; view: DisplayMovementView; devicePixelRatio: number; children: ReactNode }
  | { kind: "letter"; view: DisplayMovementView; devicePixelRatio: number; children: ReactNode }
  | { kind: "hold"; view: DisplayMovementView; devicePixelRatio: number; distanceMm: number };

export default function MovementScreen(props: MovementScreenProps) {
  if (props.kind === "frame") {
    return (
      <MovementFrame view={props.view} devicePixelRatio={props.devicePixelRatio} area="content" background="page">
        {props.children}
      </MovementFrame>
    );
  }
  if (props.kind === "letter") {
    const beside = props.view.letterLayout === "side-by-side";
    return (
      <MovementFrame
        view={props.view}
        devicePixelRatio={props.devicePixelRatio}
        area={beside ? "content" : "window"}
        background="white"
      >
        {props.children}
      </MovementFrame>
    );
  }
  const hold = props.view.hold;
  let text: ReactNode = null;
  if (hold === "waiting") {
    text = <HoldText title={null} body={MAIN_WAITING_FOR_CAMERA} />;
  } else if (hold === "paused-moved") {
    text = <HoldText title={MAIN_PAUSE_MOVED_TITLE} body={mainPauseMovedBody(props.distanceMm)} />;
  } else if (hold === "paused-lost") {
    text = <HoldText title={MAIN_PAUSE_LOST_TITLE} body={MAIN_PAUSE_LOST_BODY} />;
  }
  return (
    <MovementFrame view={props.view} devicePixelRatio={props.devicePixelRatio} area="content" background="page">
      {text}
    </MovementFrame>
  );
}
