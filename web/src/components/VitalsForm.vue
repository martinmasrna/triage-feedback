<script setup lang="ts">
import type { VitalDef } from "../types";
import { vitalIcon } from "../vitalIcons";

const props = defineProps<{ vitals: VitalDef[]; modelValue: Record<string, number>; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [Record<string, number>] }>();

function onInput(key: string, raw: string) {
  const next = { ...props.modelValue };
  if (raw.trim() === "") {
    delete next[key];
  } else {
    const n = Number(raw.replace(",", ".")); // accept Slovak decimal comma
    if (Number.isFinite(n)) next[key] = n;
    else delete next[key];
  }
  emit("update:modelValue", next);
}
</script>

<template>
  <div class="grid">
    <label v-for="v in vitals" :key="v.key" class="field">
      <span>
        <component :is="vitalIcon(v.key)" v-if="vitalIcon(v.key)" class="vital-icon" :size="18" :stroke-width="2.2" />
        {{ v.label_sk }} <small class="muted">({{ v.unit }})</small>
      </span>
      <input
        type="text"
        inputmode="decimal"
        :value="modelValue[v.key] ?? ''"
        :disabled="disabled"
        @input="onInput(v.key, ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>

<style scoped>
.grid .field {
  margin: 0.25rem 0;
}
.field > span {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.vital-icon {
  flex: none;
  color: var(--color-primary);
  opacity: 0.8;
}
</style>
