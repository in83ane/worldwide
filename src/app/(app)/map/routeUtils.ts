import type { MapTask } from './MapComponent';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const TIME_WINDOW_MIN = 90;

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function nearestNeighbor(from: [number, number], group: MapTask[]): MapTask[] {
  const remaining = [...group];
  const result: MapTask[] = [];
  let cur = from;
  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cur, [remaining[i].lat, remaining[i].lng]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    result.push(remaining[bestIdx]);
    cur = [remaining[bestIdx].lat, remaining[bestIdx].lng];
    remaining.splice(bestIdx, 1);
  }
  return result;
}

function groupByTimeWindow(tasks: MapTask[]): MapTask[][] {
  const sorted = [...tasks].sort(
    (a, b) => timeToMinutes(a.work_time) - timeToMinutes(b.work_time)
  );
  const groups: MapTask[][] = [];
  let current: MapTask[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const diff = timeToMinutes(sorted[i].work_time) - timeToMinutes(sorted[i - 1].work_time);
    if (diff <= TIME_WINDOW_MIN) current.push(sorted[i]);
    else { groups.push(current); current = [sorted[i]]; }
  }
  groups.push(current);
  return groups;
}

export function orderTasksWithTime(start: [number, number], tasks: MapTask[]): MapTask[] {
  if (tasks.length === 0) return [];
  if (tasks.length === 1) return tasks;
  const groups = groupByTimeWindow(tasks);
  const ordered: MapTask[] = [];
  let curPos = start;
  for (const group of groups) {
    const optimized = nearestNeighbor(curPos, group);
    ordered.push(...optimized);
    const last = optimized[optimized.length - 1];
    curPos = [last.lat, last.lng];
  }
  return ordered;
}