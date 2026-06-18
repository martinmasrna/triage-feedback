<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { COLOR_LABEL, COLOR_ORDER, VERDICT_LABEL, formatDateTime } from "../labels";
import { useCaseListFilters } from "../composables/useCaseListFilters";
import type { Color, DoctorCase, FiredRule } from "../types";
import CaseSummaryCard from "../components/CaseSummaryCard.vue";
import VerdictForm from "../components/VerdictForm.vue";

const router = useRouter();
const { applyFiltersAndSort } = useCaseListFilters();
const props = defineProps<{ id: number }>();
const c = ref<DoctorCase | null>(null);
const error = ref("");
const justSaved = ref(false);

const editing = ref(false);
const editAgrees = ref<boolean | null>(null);
const editComment = ref("");
const editSuggestedColor = ref<Color | null>(null);
const saving = ref(false);

const verdictAgrees = ref<boolean | null>(null);
const verdictComment = ref("");
const verdictSuggestedColor = ref<Color | null>(null);
const submittingVerdict = ref(false);

const rulesOpen = ref(false);

// Navigation: snapshot of the peer group at load time (stable while viewing the case).
const navGroup = ref<DoctorCase[]>([]);

const navIndex = computed(() => navGroup.value.findIndex((x) => x.id === props.id));
const prevCase = computed(() => (navIndex.value > 0 ? navGroup.value[navIndex.value - 1] : null));
const nextCase = computed(() =>
  navIndex.value < navGroup.value.length - 1 ? navGroup.value[navIndex.value + 1] : null,
);

const sortedFired = computed<FiredRule[]>(() =>
  c.value
    ? [...c.value.decision.fired].sort(
        (a, b) => COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color),
      )
    : [],
);

function firedCount(n: number) {
  if (n === 1) return "1 pravidlo aktivované";
  if (n <= 4) return `${n} pravidlá aktivované`;
  return `${n} pravidiel aktivovaných`;
}

watch(
  () => props.id,
  async (id) => {
    c.value = null;
    error.value = "";
    editing.value = false;
    justSaved.value = false;
    rulesOpen.value = false;
    verdictAgrees.value = null;
    verdictComment.value = "";
    verdictSuggestedColor.value = null;
    try {
      const [loaded, all] = await Promise.all([api.get(id), api.list()]);
      c.value = loaded;
      navGroup.value = applyFiltersAndSort(all);
    } catch (e) {
      error.value = (e as Error).message;
    }
  },
  { immediate: true },
);

watch(editAgrees, (val) => {
  if (val !== false) editSuggestedColor.value = null;
});

async function submitVerdict() {
  if (!c.value || verdictAgrees.value === null || (verdictAgrees.value === false && !verdictSuggestedColor.value)) return;
  submittingVerdict.value = true;
  error.value = "";
  try {
    c.value = await api.submitVerdict(c.value.id, {
      agrees: verdictAgrees.value,
      comment: verdictComment.value.trim() || undefined,
      suggested_color: verdictSuggestedColor.value ?? undefined,
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
  editSuggestedColor.value = c.value?.verdict?.suggested_color ?? null;
  editing.value = true;
  justSaved.value = false;
}

async function saveEdit() {
  if (!c.value || editAgrees.value === null || (editAgrees.value === false && !editSuggestedColor.value)) return;
  saving.value = true;
  error.value = "";
  try {
    c.value = await api.updateVerdict(c.value.id, {
      agrees: editAgrees.value,
      comment: editComment.value.trim() || undefined,
      suggested_color: editSuggestedColor.value ?? undefined,
    });
    editing.value = false;
    justSaved.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

async function deleteCase() {
  if (!c.value) return;
  if (!confirm(`Zmazať prípad č. ${c.value.id}? Táto akcia je nezvratná.`)) return;
  try {
    await api.deleteCase(c.value.id);
    router.push("/cases");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="wizard">
    <div v-if="error" class="banner banner-error">{{ error }}</div>

    <template v-if="c">
      <div class="case-nav">
        <button class="case-back-btn" @click="router.push('/cases')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
          Späť
        </button>
        <div class="case-nav-title">
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
        v-model:suggestedColor="verdictSuggestedColor"
        :decision="c.decision"
        :submitting="submittingVerdict"
        :can-submit="verdictAgrees !== null && (verdictAgrees !== false || verdictSuggestedColor !== null)"
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

        <div v-if="c.decision.fired.length" class="rules-section">
          <button type="button" class="rules-toggle" @click="rulesOpen = !rulesOpen">
            <svg class="rules-chevron" :class="{ open: rulesOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {{ firedCount(c.decision.fired.length) }}
          </button>
          <ul v-if="rulesOpen" class="rules-list">
            <li
              v-for="rule in sortedFired"
              :key="rule.name"
              class="rule-row"
              :class="{ 'rule-decisive': rule.name === c.decision.decisive?.name }"
            >
              <span class="rule-dot" :data-color="rule.color"></span>
              <span class="rule-label">{{ rule.label_sk }}</span>
              <span v-if="rule.name === c.decision.decisive?.name" class="rule-badge">rozhodujúce</span>
            </li>
          </ul>
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
            <p v-if="c.verdict.suggested_color" class="verdict-comment">
              Navrhnutá farba: <strong>{{ COLOR_LABEL[c.verdict.suggested_color] }}</strong>
            </p>
            <p v-if="c.verdict.comment" class="verdict-comment">{{ c.verdict.comment }}</p>
            <div class="actions">
              <RouterLink v-if="justSaved" to="/cases" class="btn btn-primary">Ďalší prípad →</RouterLink>
              <button type="button" class="btn btn-sm" @click="startEdit">Upraviť hodnotenie</button>
            </div>
          </template>

          <template v-else>
            <p class="verdict-question">Zmeňte hodnotenie:</p>
            <div class="verdict-toggle">
              <button
                type="button"
                class="verdict-toggle-btn"
                :class="{ selected: editAgrees === true }"
                @click="editAgrees = true"
              >
                <span class="verdict-toggle-icon">✔</span>
                Súhlasím
              </button>
              <button
                type="button"
                class="verdict-toggle-btn"
                :class="{ selected: editAgrees === false }"
                @click="editAgrees = false"
              >
                <span class="verdict-toggle-icon">✖</span>
                Nesúhlasím
              </button>
            </div>

            <div v-if="editAgrees === false" class="field" style="margin-top: 0.75rem">
              <span>Ktorá farba by bola správna? <span class="muted">(voliteľné)</span></span>
              <div class="color-pick-row">
                <button
                  v-for="color in COLOR_ORDER"
                  :key="color"
                  type="button"
                  class="color-pick-btn"
                  :class="{ selected: editSuggestedColor === color }"
                  :data-color="color"
                  :disabled="color === c.decision.color"
                  @click="editSuggestedColor = editSuggestedColor === color ? null : color"
                >
                  {{ COLOR_LABEL[color] }}
                  <span v-if="color === c.decision.color" class="color-pick-system-label">systém</span>
                </button>
              </div>
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
                class="btn"
                :class="{ 'opacity-40': editAgrees === null || (editAgrees === false && editSuggestedColor === null) }"
                :disabled="saving || editAgrees === null || (editAgrees === false && editSuggestedColor === null)"
                @click="saveEdit"
              >
                <span v-if="saving" class="spinner"></span> Uložiť
              </button>
              <button type="button" class="btn btn-ghost" :disabled="saving" @click="editing = false">Zrušiť</button>
            </div>
          </template>
        </div>
      </div>

      <div class="case-footer">
        <p class="case-timestamp">{{ formatDateTime(c.created_at) }}</p>
        <button
          v-if="c.source === 'doctor'"
          type="button"
          class="case-delete-btn"
          title="Zmazať prípad"
          @click="deleteCase"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Zmazať
        </button>
      </div>
    </template>
  </div>
</template>
