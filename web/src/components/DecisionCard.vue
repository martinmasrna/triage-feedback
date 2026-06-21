<script setup lang="ts">
import { ref, computed } from "vue";
import { COLOR_LABEL, COLOR_ORDER } from "../assets/labels";
import type { Decision } from "../interfaces/types";

const props = defineProps<{ decision: Decision }>();
const rulesOpen = ref(false);

const sortedFired = computed(() =>
  [...props.decision.fired].sort((a, b) => COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color)),
);

function firedCount(n: number) {
  if (n === 1) return "1 pravidlo aktivované";
  if (n <= 4) return `${n} pravidlá aktivované`;
  return `${n} pravidiel aktivovaných`;
}
</script>

<template>
  <div class="card decision-card" :data-color="decision.color">
    <div class="decision-banner">
      <span class="decision-banner-color">{{ COLOR_LABEL[decision.color] }}</span>
      <span class="decision-banner-sep">—</span>
      <span class="decision-banner-rule">
        {{ decision.decisive ? decision.decisive.label_sk : 'Žiadne pravidlo sa neaktivovalo' }}
      </span>
    </div>

    <div v-if="decision.fired.length" class="rules-section">
      <button type="button" class="rules-toggle" @click="rulesOpen = !rulesOpen">
        <svg class="rules-chevron" :class="{ open: rulesOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {{ firedCount(decision.fired.length) }}
      </button>
      <ul v-if="rulesOpen" class="rules-list">
        <li
          v-for="rule in sortedFired"
          :key="rule.name"
          class="rule-row"
          :class="{ 'rule-decisive': rule.name === decision.decisive?.name }"
        >
          <span class="rule-dot" :data-color="rule.color"></span>
          <span class="rule-label">{{ rule.label_sk }}</span>
          <span v-if="rule.name === decision.decisive?.name" class="rule-badge">rozhodujúce</span>
        </li>
      </ul>
    </div>

    <div class="card-body">
      <slot />
    </div>
  </div>
</template>
