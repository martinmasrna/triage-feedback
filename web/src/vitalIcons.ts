// Presentational-only mapping from vital keys to Lucide icons. Kept out of the server
// vocabulary (purely cosmetic) — same spirit as categoryIcons.ts.
import type { FunctionalComponent } from "vue";
import { Droplets, Frown, Gauge, HeartPulse, TestTube, Thermometer, Timer, Wind } from "lucide-vue-next";

export const VITAL_ICONS: Record<string, FunctionalComponent> = {
  hr: HeartPulse,
  rr: Wind,
  spo2: Droplets,
  temp: Thermometer,
  systolic_bp: Gauge,
  diastolic_bp: Gauge,
  crt: Timer,
  glucose: TestTube,
  pain_score: Frown,
};

export function vitalIcon(key: string): FunctionalComponent | undefined {
  return VITAL_ICONS[key];
}
