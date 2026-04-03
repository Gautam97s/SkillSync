export function normalizeLandmarks(points: number[][]): number[][] {
  if (!points.length) {
    return [];
  }

  const [baseX, baseY, baseZ] = points[0];
  return points.map(([x, y, z]) => [x - baseX, y - baseY, z - baseZ]);
}
