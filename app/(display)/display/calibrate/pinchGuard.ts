export const PINCH_ZOOM_MESSAGE =
  "The page is zoomed in. Use two fingers to zoom back to normal size, then press Confirm again.";

export const PINCH_ZOOM_MESSAGE_RULER =
  "The page is zoomed in. Use two fingers to zoom back to normal size, then press Save again.";

export function isPinchZoomed(): boolean {
  const visualViewport = window.visualViewport;
  return (
    visualViewport !== null &&
    visualViewport !== undefined &&
    (visualViewport.scale < 0.99 || visualViewport.scale > 1.01)
  );
}
