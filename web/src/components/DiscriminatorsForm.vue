<script setup lang="ts">
import type { TriState } from "../types";
import type { FindingRow } from "../discriminatorGroups";
import { TRISTATE_LABEL } from "../labels";
import SeverityToggle from "./SeverityToggle.vue";

const props = defineProps<{ rows: FindingRow[]; modelValue: Record<string, TriState>; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [Record<string, TriState>] }>();

const states: TriState[] = ["present", "absent", "unknown"];

function stateOf(key: string): TriState {
  return props.modelValue[key] ?? "unknown";
}

function set(key: string, state: TriState) {
  emit("update:modelValue", { ...props.modelValue, [key]: state });
}

function setPair(severeKey: string, moderateKey: string, pair: { severe: TriState; moderate: TriState }) {
  emit("update:modelValue", { ...props.modelValue, [severeKey]: pair.severe, [moderateKey]: pair.moderate });
}
</script>

<template>
  <div class="discriminators">
    <div v-for="row in rows" :key="row.kind === 'toggle' ? row.def.key : row.severeKey" class="disc-row">
      <template v-if="row.kind === 'toggle'">
        <span class="disc-label">{{ row.def.label_sk }}</span>
        <div class="tristate">
          <button
            v-for="s in states"
            :key="s"
            type="button"
            class="tristate-btn"
            :class="[`tristate-${s}`, { selected: stateOf(row.def.key) === s }]"
            :disabled="disabled"
            @click="set(row.def.key, s)"
          >
            {{ TRISTATE_LABEL[s] }}
          </button>
        </div>
      </template>
      <template v-else>
        <span class="disc-label">{{ row.label_sk }}</span>
        <SeverityToggle
          :options="row.options"
          :severe="stateOf(row.severeKey)"
          :moderate="stateOf(row.moderateKey)"
          :disabled="disabled"
          @update="(pair) => setPair(row.severeKey, row.moderateKey, pair)"
        />
      </template>
    </div>
  </div>
</template>
