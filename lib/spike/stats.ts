/** Frame statistics for the camera spike. Pure numbers. */

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

/** Sample standard deviation (n − 1). NaN for fewer than two values. */
export function sampleStandardDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return Number.NaN;
  }
  const average = mean(values);
  let sumOfSquares = 0;
  for (const value of values) {
    sumOfSquares += (value - average) ** 2;
  }
  return Math.sqrt(sumOfSquares / (values.length - 1));
}

/** Sample standard deviation as a percentage of the mean. */
export function standardDeviationPercent(values: readonly number[]): number {
  return (sampleStandardDeviation(values) / mean(values)) * 100;
}

/** Keeps the last `capacity` values. */
export class RollingWindow {
  private readonly items: number[] = [];

  constructor(private readonly capacity: number) {}

  push(value: number): void {
    this.items.push(value);
    if (this.items.length > this.capacity) {
      this.items.shift();
    }
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }

  values(): readonly number[] {
    return this.items;
  }

  mean(): number {
    return mean(this.items);
  }

  standardDeviationPercent(): number {
    return standardDeviationPercent(this.items);
  }
}
