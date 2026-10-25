export type DetectionInput = { drowsinessScore: number; eyeClosedMs?: number; confidence: number };

export function classifyDrowsiness(input: DetectionInput): null | { level: 'WARNING' | 'CRITICAL'; reason: string } {
  if (input.confidence < 0.6) return null;
  if (input.drowsinessScore >= 0.85 || (input.eyeClosedMs ?? 0) >= 2000) {
    return { level: 'CRITICAL', reason: 'Microsleep risk detected' };
  }
  if (input.drowsinessScore >= 0.65 || (input.eyeClosedMs ?? 0) >= 1000) {
    return { level: 'WARNING', reason: 'Sustained eye closure or elevated fatigue score' };
  }
  return null;
}
