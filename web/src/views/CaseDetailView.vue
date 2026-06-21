<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../services/api";
import { COLOR_LABEL, VERDICT_LABEL, formatDateTime } from "../assets/labels";
import { useCaseListFilters } from "../composables/useCaseListFilters";
import type { Color, DoctorCase } from "../interfaces/types";
import CaseSummaryCard from "../components/CaseSummaryCard.vue";
import VerdictForm from "../components/VerdictForm.vue";
import DecisionCard from "../components/DecisionCard.vue";

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
        submit-label="Uložiť hodnotenie"
        @submit="submitVerdict"
      />

      <!-- Reviewed: editing the verdict -->
      <VerdictForm
        v-else-if="editing"
        v-model:agrees="editAgrees"
        v-model:comment="editComment"
        v-model:suggestedColor="editSuggestedColor"
        :decision="c.decision"
        :submitting="saving"
        submit-label="Uložiť"
        cancel-label="Zrušiť"
        @submit="saveEdit"
        @cancel="editing = false"
      />

      <!-- Reviewed: read-only -->
      <DecisionCard v-else :decision="c.decision">
        <div v-if="justSaved" class="banner banner-success" style="margin-bottom: 0.75rem; margin-top: 0">
          Hodnotenie uložené.
        </div>
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
      </DecisionCard>

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
