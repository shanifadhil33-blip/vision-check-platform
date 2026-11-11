/**
 * Splits saved distance readings into calls of at most 50 and sends them in
 * order. A failed or throwing call is reported once and dropped; this never
 * throws, so the test never stops for a reading that was not saved.
 */

export const MAX_READINGS_PER_CALL = 50;

export type BatchSendResult = { ok: true } | { ok: false; message: string };

export async function sendReadingBatches<T>(
  readings: readonly T[],
  send: (batch: T[]) => Promise<BatchSendResult>,
  onFailure: (message: string, droppedCount: number) => void,
  maxPerCall: number = MAX_READINGS_PER_CALL,
): Promise<{ sent: number; dropped: number }> {
  let sent = 0;
  let dropped = 0;
  for (let start = 0; start < readings.length; start += maxPerCall) {
    const batch = readings.slice(start, start + maxPerCall);
    let result: BatchSendResult;
    try {
      result = await send(batch);
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    if (result.ok) {
      sent += batch.length;
      continue;
    }
    dropped += batch.length;
    try {
      onFailure(result.message, batch.length);
    } catch {
      // Reporting must never stop the test either.
    }
  }
  return { sent, dropped };
}
