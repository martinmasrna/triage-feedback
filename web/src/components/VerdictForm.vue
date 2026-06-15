<script setup lang="ts">
defineProps<{
  submitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
}>();
defineEmits<{ submit: [] }>();

const agrees = defineModel<boolean | null>("agrees", { required: true });
const comment = defineModel<string>("comment", { required: true });
</script>

<template>
  <div class="card">
    <h3>Súhlasíte s rozhodnutím systému?</h3>
    <div class="choice-row">
      <button
        type="button"
        class="choice-btn choice-agree"
        :class="{ selected: agrees === true }"
        @click="agrees = true"
      >
        ✓ Súhlasím
      </button>
      <button
        type="button"
        class="choice-btn choice-disagree"
        :class="{ selected: agrees === false }"
        @click="agrees = false"
      >
        ✕ Nesúhlasím
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
      <button type="button" class="btn btn-primary" :class="{ 'is-dim': !canSubmit }" :disabled="submitting" @click="$emit('submit')">
        <span v-if="submitting" class="spinner"></span> {{ submitLabel }}
      </button>
    </div>
  </div>
</template>
