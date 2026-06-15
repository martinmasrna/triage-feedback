<script setup lang="ts">
import { ref, watch } from "vue";
import { api } from "../api";
import { VERDICT_LABEL } from "../labels";
import type { DoctorCase } from "../types";
import CaseSummaryCard from "../components/CaseSummaryCard.vue";
import RuleExplanation from "../components/RuleExplanation.vue";
import VerdictForm from "../components/VerdictForm.vue";

const props = defineProps<{ id: string }>();
const c = ref<DoctorCase | null>(null);
const error = ref("");

// Revisiting a saved case: the doctor may revise the agree/disagree and/or the comment.
const editing = ref(false);
const editAgrees = ref<boolean | null>(null);
const editComment = ref("");
const saving = ref(false);

// Pending cases (AI-prefilled, pre-triaged, verdict === null): the doctor's first-ever verdict.
const verdictAgrees = ref<boolean | null>(null);
const verdictComment = ref("");
const submittingVerdict = ref(false);

// Watch the id (not onMounted) so navigating between two case details — e.g. via the sidebar —
// reloads the record even though Vue reuses the same component instance.
watch(
  () => props.id,
  async (id) => {
    c.value = null;
    error.value = "";
    editing.value = false;
    verdictAgrees.value = null;
    verdictComment.value = "";
    try {
      c.value = await api.get(id);
    } catch (e) {
      error.value = (e as Error).message;
    }
  },
  { immediate: true },
);

async function submitVerdict() {
  if (!c.value || verdictAgrees.value === null) return;
  submittingVerdict.value = true;
  error.value = "";
  try {
    c.value = await api.submitVerdict(c.value.id, {
      agrees: verdictAgrees.value,
      comment: verdictComment.value.trim() || undefined,
    });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    submittingVerdict.value = false;
  }
}

function startEdit() {
  editAgrees.value = c.value?.verdict?.agrees ?? null;
  editComment.value = c.value?.verdict?.comment ?? "";
  editing.value = true;
}

async function saveEdit() {
  if (!c.value || editAgrees.value === null) return;
  saving.value = true;
  error.value = "";
  try {
    c.value = await api.updateVerdict(c.value.id, {
      agrees: editAgrees.value,
      comment: editComment.value.trim() || undefined,
    });
    editing.value = false;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="wizard">
    <p><RouterLink to="/cases">← Moje prípady</RouterLink></p>
    <div v-if="error" class="banner banner-error">{{ error }}</div>

    <template v-if="c">
      <h1>Detail prípadu</h1>
      <p class="muted small">{{ new Date(c.created_at).toLocaleString("sk-SK") }}</p>

      <CaseSummaryCard
        title="Zadané údaje"
        :age="c.entered.age"
        :complaint-category="c.entered.complaint_category"
        :complaint-text="c.entered.complaint_text"
        :note="c.entered.note"
        :vitals="c.entered.vitals"
        :discriminators="c.entered.discriminators"
      />

      <div class="card">
        <h3>Rozhodnutie systému</h3>
        <RuleExplanation :decision="c.decision" />
      </div>

      <!-- Pending case: the doctor's first-ever verdict. -->
      <VerdictForm
        v-if="c.verdict === null"
        v-model:agrees="verdictAgrees"
        v-model:comment="verdictComment"
        :submitting="submittingVerdict"
        :can-submit="verdictAgrees !== null"
        submit-label="Uložiť hodnotenie"
        @submit="submitVerdict"
      />

      <!-- Already-reviewed case: read-only verdict, comment editable. -->
      <div v-else class="card">
        <h3>Vaše hodnotenie</h3>
        <p>
          <strong>{{ c.verdict.agrees ? VERDICT_LABEL.agree : VERDICT_LABEL.disagree }}</strong>
          s rozhodnutím systému
        </p>

        <!-- Both the agree/disagree and the comment can be revised. -->
        <template v-if="!editing">
          <p v-if="c.verdict.comment"><strong>Komentár:</strong> {{ c.verdict.comment }}</p>
          <p v-else class="muted">Bez komentára.</p>
          <div class="actions">
            <button type="button" class="btn btn-sm" @click="startEdit">Upraviť hodnotenie</button>
          </div>
        </template>
        <template v-else>
          <div class="choice-row">
            <button
              type="button"
              class="choice-btn choice-agree"
              :class="{ selected: editAgrees === true }"
              @click="editAgrees = true"
            >
              ✓ Súhlasím
            </button>
            <button
              type="button"
              class="choice-btn choice-disagree"
              :class="{ selected: editAgrees === false }"
              @click="editAgrees = false"
            >
              ✕ Nesúhlasím
            </button>
          </div>
          <label class="field" style="margin-top: 1rem">
            <span>Komentár <span class="muted">(voliteľné)</span></span>
            <textarea
              v-model="editComment"
              rows="3"
              placeholder="Vysvetlenie vášho hodnotenia — prečítal systém prípad zle, alebo zle rozhodol?"
            ></textarea>
          </label>
          <div class="actions">
            <button
              type="button"
              class="btn btn-primary"
              :class="{ 'is-dim': editAgrees === null }"
              :disabled="saving || editAgrees === null"
              @click="saveEdit"
            >
              <span v-if="saving" class="spinner"></span> Uložiť
            </button>
            <button type="button" class="btn btn-ghost" :disabled="saving" @click="editing = false">Zrušiť</button>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
