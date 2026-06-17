<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { COLOR_LABEL, VERDICT_LABEL } from "../labels";
import type { DoctorCase } from "../types";
import CaseSummaryCard from "../components/CaseSummaryCard.vue";
import VerdictForm from "../components/VerdictForm.vue";

const router = useRouter();
const props = defineProps<{ id: number }>();
const c = ref<DoctorCase | null>(null);
const error = ref("");
const justSaved = ref(false);

const editing = ref(false);
const editAgrees = ref<boolean | null>(null);
const editComment = ref("");
const saving = ref(false);

const verdictAgrees = ref<boolean | null>(null);
const verdictComment = ref("");
const submittingVerdict = ref(false);

// Navigation: snapshot of the peer group at load time (stable while viewing the case).
const navGroup = ref<DoctorCase[]>([]);

const navIndex = computed(() => navGroup.value.findIndex((x) => x.id === props.id));
const prevCase = computed(() => (navIndex.value > 0 ? navGroup.value[navIndex.value - 1] : null));
const nextCase = computed(() =>
  navIndex.value < navGroup.value.length - 1 ? navGroup.value[navIndex.value + 1] : null,
);

watch(
  () => props.id,
  async (id) => {
    c.value = null;
    error.value = "";
    editing.value = false;
    justSaved.value = false;
    verdictAgrees.value = null;
    verdictComment.value = "";
    try {
      const [loaded, all] = await Promise.all([api.get(id), api.list()]);
      c.value = loaded;
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (loaded.source === "doctor") {
        navGroup.value = all.filter((x) => x.source === "doctor");
      } else if (loaded.verdict === null) {
        navGroup.value = all.filter((x) => x.source === "ai_generated" && x.verdict === null);
      } else {
        navGroup.value = all.filter((x) => x.source === "ai_generated" && x.verdict !== null);
      }
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
    justSaved.value = true;
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
  justSaved.value = false;
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
    justSaved.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="wizard">
    <div v-if="error" class="banner banner-error">{{ error }}</div>

    <template v-if="c">
      <div class="case-nav">
        <button
          class="case-nav-btn"
          :disabled="!prevCase"
          :title="prevCase ? `Prípad č. ${prevCase.id}` : undefined"
          @click="prevCase && router.push(`/cases/${prevCase.id}`)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <h1>Prípad č. {{ c.id }}</h1>
        <button
          class="case-nav-btn"
          :disabled="!nextCase"
          :title="nextCase ? `Prípad č. ${nextCase.id}` : undefined"
          @click="nextCase && router.push(`/cases/${nextCase.id}`)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      </div>

      <CaseSummaryCard
        :age="c.entered.age"
        :complaint-category="c.entered.complaint_category"
        :complaint-text="c.entered.complaint_text"
        :note="c.entered.note"
        :vitals="c.entered.vitals"
        :discriminators="c.entered.discriminators"
      />

      <!-- Pending: first-ever verdict -->
      <VerdictForm
        v-if="c.verdict === null"
        v-model:agrees="verdictAgrees"
        v-model:comment="verdictComment"
        :decision="c.decision"
        :submitting="submittingVerdict"
        :can-submit="verdictAgrees !== null"
        submit-label="Uložiť hodnotenie"
        @submit="submitVerdict"
      />

      <!-- Already reviewed -->
      <div v-else class="card decision-card" :data-color="c.decision.color">
        <div class="decision-banner">
          <span class="decision-banner-color">{{ COLOR_LABEL[c.decision.color] }}</span>
          <span class="decision-banner-sep">—</span>
          <span class="decision-banner-rule">
            {{ c.decision.decisive ? c.decision.decisive.label_sk : 'Žiadne pravidlo sa neaktivovalo' }}
          </span>
        </div>

        <div class="card-body">
          <div v-if="justSaved" class="banner banner-success" style="margin-bottom: 0.75rem; margin-top: 0">
            Hodnotenie uložené.
          </div>

          <template v-if="!editing">
            <p class="verdict-summary">
              <strong>{{ c.verdict.agrees ? VERDICT_LABEL.agree : VERDICT_LABEL.disagree }}</strong>
              <span class="muted"> s rozhodnutím systému</span>
            </p>
            <p v-if="c.verdict.comment" class="verdict-comment">{{ c.verdict.comment }}</p>
            <div class="actions">
              <RouterLink v-if="justSaved" to="/cases" class="btn btn-primary">Ďalší prípad →</RouterLink>
              <button type="button" class="btn btn-sm" @click="startEdit">Upraviť hodnotenie</button>
            </div>
          </template>

          <template v-else>
            <p class="verdict-question">Zmeňte hodnotenie:</p>
            <div class="choice-row">
              <button
                type="button"
                class="choice-btn choice-agree"
                :class="{ selected: editAgrees === true }"
                @click="editAgrees = true"
              >
                <span class="choice-icon">✔</span>
                <span class="choice-label">Súhlasím</span>
              </button>
              <button
                type="button"
                class="choice-btn choice-disagree"
                :class="{ selected: editAgrees === false }"
                @click="editAgrees = false"
              >
                <span class="choice-icon">✖</span>
                <span class="choice-label">Nesúhlasím</span>
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
                class="btn btn-outline"
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
      </div>

      <p class="case-timestamp">{{ new Date(c.created_at).toLocaleString("sk-SK") }}</p>
    </template>
  </div>
</template>
