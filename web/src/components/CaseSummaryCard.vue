<script setup lang="ts">
import { AGE_UNIT_LABEL, TRISTATE_LABEL } from "../labels";
import { useVocab } from "../vocab";
import type { AgeUnit, TriState } from "../types";

const { complaintLabel, discriminatorLabel, vitalLabel, vitalUnit } = useVocab();

const props = defineProps<{
  title: string;
  age: { value: number; unit: AgeUnit };
  complaintCategory: string;
  complaintText?: string;
  note?: string;
  vitals: Record<string, number>;
  discriminators: Record<string, TriState>;
}>();

const vitalsEntries = () => Object.entries(props.vitals);
const discEntries = () => Object.entries(props.discriminators).filter(([, s]) => s !== "unknown");
</script>

<template>
  <div class="card">
    <h3>{{ title }}</h3>

    <div class="case-stats">
      <div class="stat">
        <span class="stat-label">Vek</span>
        <span class="stat-value">{{ age.value }} {{ AGE_UNIT_LABEL[age.unit] }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Dôvod</span>
        <span class="stat-value">
          {{ complaintLabel(complaintCategory) }}
          <template v-if="complaintText"> — {{ complaintText }}</template>
        </span>
      </div>
    </div>

    <div v-if="note" class="note-block">
      <span class="note-label">Záznam</span>
      <p>{{ note }}</p>
    </div>

    <div v-if="vitalsEntries().length" class="tag-group">
      <span class="tag-group-label">Vitálne funkcie (zadané)</span>
      <div class="tags">
        <span v-for="[k, v] in vitalsEntries()" :key="k" class="tag">{{ vitalLabel(k) }}: {{ v }} {{ vitalUnit(k) }}</span>
      </div>
    </div>

    <div v-if="discEntries().length" class="tag-group">
      <span class="tag-group-label">Nálezy (zadané)</span>
      <div class="tags">
        <span v-for="[k, s] in discEntries()" :key="k" class="tag">{{ discriminatorLabel(k) }}: {{ TRISTATE_LABEL[s] }}</span>
      </div>
    </div>

    <slot name="actions" />
  </div>
</template>
