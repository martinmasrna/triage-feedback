<script setup lang="ts">
import { COLOR_LABEL } from "../labels";
import type { Decision } from "../types";

defineProps<{
  decision: Decision;
  submitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
}>();
defineEmits<{ submit: [] }>();

const agrees = defineModel<boolean | null>("agrees", { required: true });
const comment = defineModel<string>("comment", { required: true });
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

    <div class="card-body">
      <p class="verdict-question">Súhlasíte s rozhodnutím systému?</p>
      <div class="choice-row">
        <button
          type="button"
          class="choice-btn choice-agree"
          :class="{ selected: agrees === true }"
          @click="agrees = true"
        >
          <span class="choice-icon">✔</span>
          <span class="choice-label">Súhlasím</span>
        </button>
        <button
          type="button"
          class="choice-btn choice-disagree"
          :class="{ selected: agrees === false }"
          @click="agrees = false"
        >
          <span class="choice-icon">✖</span>
          <span class="choice-label">Nesúhlasím</span>
        </button>
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
          class="btn btn-outline"
          :class="{ 'is-dim': !canSubmit }"
          :disabled="submitting"
          @click="$emit('submit')"
        >
          <span v-if="submitting" class="spinner"></span> {{ submitLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
