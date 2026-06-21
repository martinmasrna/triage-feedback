<script setup lang="ts">
import { computed, watch } from "vue";
import DecisionCard from "./DecisionCard.vue";
import { COLOR_LABEL, COLOR_ORDER } from "../assets/labels";
import type { Color, Decision } from "../interfaces/types";

defineProps<{
  decision: Decision;
  submitting: boolean;
  submitLabel: string;
  cancelLabel?: string;
}>();
defineEmits<{ submit: []; cancel: [] }>();

const agrees = defineModel<boolean | null>("agrees", { required: true });
const comment = defineModel<string>("comment", { required: true });
const suggestedColor = defineModel<Color | null>("suggestedColor", { default: null });
const verdictValid = computed(() => agrees.value !== null && (agrees.value || suggestedColor.value !== null));

watch(agrees, (val) => {
  if (val !== false) suggestedColor.value = null;
});
</script>

<template>
  <DecisionCard :decision="decision">
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
      <span>Ktorá farba by bola správna? <span class="req">*</span></span>
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
        v-if="cancelLabel"
        type="button"
        class="btn btn-ghost"
        :disabled="submitting"
        @click="$emit('cancel')"
      >
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="submitting || !verdictValid"
        @click="$emit('submit')"
      >
        <span v-if="submitting" class="spinner"></span> {{ submitLabel }}
      </button>
    </div>
  </DecisionCard>
</template>
