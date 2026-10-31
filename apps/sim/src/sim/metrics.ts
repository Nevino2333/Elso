export interface SimMetrics {
  alive: number;
  gathered: number;
  communications: number;
  events: number;
  traded: number;
}

export function summarizeMetrics(logs: { metrics: SimMetrics }[]): SimMetrics {
  const last = logs[logs.length - 1]?.metrics;
  return last ?? { alive: 0, gathered: 0, communications: 0, events: 0, traded: 0 };
}