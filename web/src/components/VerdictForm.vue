<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { COLOR_LABEL, COLOR_ORDER } from "../labels";
import type { Color, Decision } from "../types";

const props = defineProps<{
  decision: Decision;
  submitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
}>();
defineEmits<{ submit: [] }>();

const agrees = defineModel<boolean | null>("agrees", { required: true });
const comment = defineModel<string>("comment", { required: true });
const suggestedColor = defineModel<Color | null>("suggestedColor", { default: null });

const rulesOpen = ref(false);

const sortedFired = computed(() =>
  [...props.decision.fired].sort(
    (a, b) => COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color),
  ),
);

function firedCount(n: number) {
  if (n === 1) return "1 pravidlo aktivované";
  if (n <= 4) return `${n} pravidlá aktivované`;
  return `${n} pravidiel aktivovaných`;
}

watch(agrees, (val) => {
  if (val !== false) suggestedColor.value = null;
});
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
      <p class="verdict-question">Súhlasíte s rozhodnutím systému?</p>
      <div class="verdict-toggle">
        <button
          type="button"
          class="verdict-toggle-btn"
          :class="{ selected: agrees === true }"
          @click="agrees = true"
        >
          <span class="verdict-toggle-icon">✔</span>
          Súhlasím
        </button>
        <button
          type="button"
          class="verdict-toggle-btn"
          :class="{ selected: agrees === false }"
          @click="agrees = false"
        >
          <span class="verdict-toggle-icon">✖</span>
          Nesúhlasím
        </button>
      </div>

      <div v-if="agrees === false" class="field" style="margin-top: 0.75rem">
        <span>Ktorá farba by bola správna? <span class="muted">(voliteľné)</span></span>
        <div class="color-pick-row">
          <button
            v-for="color in COLOR_ORDER"
            :key="color"
            type="button"
            class="color-pick-btn"
            :class="{ selected: suggestedColor === color }"
            :data-color="color"
            :disabled="color === decision.color"
            @click="suggestedColor = suggestedColor === color ? null : color"
          >
            {{ COLOR_LABEL[color] }}
            <span v-if="color === decision.color" class="color-pick-system-label">systém</span>
          </button>
        </div>
      </div>

      <label class="field" style="margin-top: 1rem">
        <span>Komentár <span class="muted">(voliteľné)</span></span>
        <textarea
          v-model="comment"
          rows="3"
          placeholder="Vysvetlenie vášho hodnotenia — najmä pri nesúhlase: prečítal systém prípad zle, alebo zle rozhodol?"
        ></textarea>
      </label>

      <div class="actions actions-end">
        <button
          type="button"
          class="btn"
          :class="{ 'opacity-40': !canSubmit }"
          :disabled="submitting || !canSubmit"
          @click="$emit('submit')"
        >
          <span v-if="submitting" class="spinner"></span> {{ submitLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
