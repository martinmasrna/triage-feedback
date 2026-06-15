<script setup lang="ts">
import { computed } from "vue";
import type { TriState } from "../types";
import type { SeverityOption, SeverityValue } from "../discriminatorGroups";

const props = defineProps<{
  options: SeverityOption[];
  severe: TriState;
  moderate: TriState;
  disabled?: boolean;
}>();
const emit = defineEmits<{ update: [{ severe: TriState; moderate: TriState }] }>();

// Severe/moderate are still two independent tri-states under the hood — derive the single
// 4-state selection from them, defaulting to "unknown" for any state not representable here
// (e.g. both somehow "present"), so the control never silently shows a wrong answer.
const current = computed<SeverityValue>(() => {
  if (props.severe === "present") return "severe";
  if (props.moderate === "present") return "moderate";
  if (props.severe === "absent" && props.moderate === "absent") return "none";
  return "unknown";
});

const PAIR: Record<SeverityValue, { severe: TriState; moderate: TriState }> = {
  severe: { severe: "present", moderate: "absent" },
  moderate: { severe: "absent", moderate: "present" },
  none: { severe: "absent", moderate: "absent" },
  unknown: { severe: "unknown", moderate: "unknown" },
};

function select(value: SeverityValue) {
  emit("update", PAIR[value]);
}
</script>

<template>
  <div class="severity-toggle">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="severity-btn"
      :class="[`severity-${o.value}`, { selected: current === o.value }]"
      :disabled="disabled"
      @click="select(o.value)"
    >
      {{ o.label_sk }}
    </button>
  </div>
</template>
