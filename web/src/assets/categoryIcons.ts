// Presentational-only mapping from complaint-category keys to Lucide icons. Keeps icon choices
// out of the server vocabulary (purely cosmetic, not part of the domain model) — same spirit as
// discriminatorGroups.ts.
import type { FunctionalComponent } from "vue";
import {
  Bandage,
  Brain,
  BrainCircuit,
  CircleHelp,
  Ear,
  Skull,
  Soup,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-vue-next";

export const CATEGORY_ICONS: Record<string, FunctionalComponent> = {
  respiratory: Wind,
  fever: Thermometer,
  trauma: Bandage,
  gastrointestinal: Soup,
  neurological: Brain,
  rash: Sparkles,
  ent: Ear,
  poisoning: Skull,
  psychiatric: BrainCircuit,
  other: CircleHelp,
};

export function categoryIcon(key: string): FunctionalComponent {
  return CATEGORY_ICONS[key] ?? CircleHelp;
}
