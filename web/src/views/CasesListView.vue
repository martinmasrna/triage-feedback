<script setup lang="ts">
import { computed, ref, onActivated } from "vue";
import AgeRangeSlider from "../components/AgeRangeSlider.vue";
import DateRangePicker from "../components/DateRangePicker.vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { formatAge, formatDateTime, COLOR_LABEL, COLOR_ORDER, PENDING_LABEL, SOURCE_LABEL, VERDICT_LABEL } from "../labels";
import { useVocab } from "../vocab";
import { useCaseListFilters } from "../composables/useCaseListFilters";
import type { SortKey } from "../composables/useCaseListFilters";
import type { DoctorCase } from "../types";
import ColorChip from "../components/ColorChip.vue";

defineOptions({ name: "CasesListView" });

const router = useRouter();
const { complaintLabel } = useVocab();
const { filter, sortKey, sortAsc, anyFilterActive, applyFiltersAndSort } = useCaseListFilters();
const cases = ref<DoctorCase[]>([]);
const loading = ref(false);
const error = ref("");

// ── Date range picker ──────────────────────────────────────────────────────
const datePickerEl = ref<InstanceType<typeof DateRangePicker> | null>(null);
const ageSliderEl  = ref<InstanceType<typeof AgeRangeSlider>  | null>(null);

function resetFilters() {
  filter.dateFrom = "";
  filter.dateTo = "";
  filter.ageFromDays = null;
  filter.ageToDays = null;
  filter.complaint = "";
  filter.source = "";
  filter.color = "";
  filter.verdict = "";
  datePickerEl.value?.reset();
  ageSliderEl.value?.reset();
  sortKey.value = "time";
  sortAsc.value = false;
}

// ── Sort ───────────────────────────────────────────────────────────────────
function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value;
  else { sortKey.value = key; sortAsc.value = false; }
}
function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return "";
  return sortAsc.value ? " ▲" : " ▼";
}

// ── Filtered + sorted list ─────────────────────────────────────────────────
const filtered = computed(() => applyFiltersAndSort(cases.value));

// ── Unique complaint categories present in loaded cases ────────────────────
const presentCategories = computed(() =>
  [...new Set(cases.value.map((c) => c.entered.complaint_category))].sort(),
);

// ── Data loading ───────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  error.value = "";
  try {
    cases.value = await api.list();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
};

onActivated(load);

</script>

<template>
  <div class="list-header">
    <h1>Všetky prípady</h1>
    <button v-if="anyFilterActive" type="button" class="btn btn-sm" @click="resetFilters">Zrušiť filtre</button>
  </div>

  <div v-if="error" class="banner banner-error">{{ error }}</div>
  <p v-if="loading" class="muted">Načítavam…</p>

  <div v-else-if="cases.length === 0" class="card">
    <p class="muted">Zatiaľ žiadne prípady. Začnite vytvorením nového prípadu.</p>
    <div class="actions">
      <button type="button" class="btn btn-primary" @click="router.push('/')">Nový prípad</button>
    </div>
  </div>

  <template v-else>
    <table class="cases">
      <thead>
        <tr>
          <th>ID</th>
          <th class="sortable" @click="toggleSort('time')">Čas{{ sortArrow("time") }}</th>
          <th class="sortable" @click="toggleSort('age')">Vek{{ sortArrow("age") }}</th>
          <th class="sortable" @click="toggleSort('complaint')">Dôvod{{ sortArrow("complaint") }}</th>
          <th class="sortable" @click="toggleSort('source')">Pôvod{{ sortArrow("source") }}</th>
          <th class="sortable" @click="toggleSort('color')">Systém{{ sortArrow("color") }}</th>
          <th class="sortable" @click="toggleSort('verdict')">Hodnotenie{{ sortArrow("verdict") }}</th>
        </tr>
        <tr class="filter-row">
          <th></th>
          <th>
            <DateRangePicker
              ref="datePickerEl"
              @change="({ from, to }) => { filter.dateFrom = from ?? ''; filter.dateTo = to ?? ''; }"
            />
          </th>
          <th>
            <AgeRangeSlider
              ref="ageSliderEl"
              @change="({ fromDays, toDays }) => { filter.ageFromDays = fromDays; filter.ageToDays = toDays; }"
            />
          </th>
          <th>
            <select v-model="filter.complaint">
              <option value="">Všetky</option>
              <option v-for="key in presentCategories" :key="key" :value="key">{{ complaintLabel(key) }}</option>
            </select>
          </th>
          <th>
            <select v-model="filter.source">
              <option value="">Všetky</option>
              <option value="doctor">{{ SOURCE_LABEL.doctor }}</option>
              <option value="ai_generated">{{ SOURCE_LABEL.ai_generated }}</option>
            </select>
          </th>
          <th>
            <select v-model="filter.color">
              <option value="">Všetky</option>
              <option v-for="c in COLOR_ORDER" :key="c" :value="c">{{ COLOR_LABEL[c] }}</option>
            </select>
          </th>
          <th>
            <select v-model="filter.verdict">
              <option value="">Všetky</option>
              <option value="agree">{{ VERDICT_LABEL.agree }}</option>
              <option value="disagree">{{ VERDICT_LABEL.disagree }}</option>
              <option value="pending">{{ PENDING_LABEL }}</option>
            </select>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in filtered" :key="c.id" class="clickable" @click="router.push(`/cases/${c.id}`)">
          <td class="col-id">{{ c.id }}</td>
          <td>{{ formatDateTime(c.created_at) }}</td>
          <td>{{ formatAge(c.entered.age.value, c.entered.age.unit) }}</td>
          <td>{{ complaintLabel(c.entered.complaint_category) }}</td>
          <td>{{ SOURCE_LABEL[c.source] }}</td>
          <td><ColorChip :color="c.decision.color" /></td>
          <td>{{ c.verdict ? (c.verdict.agrees ? VERDICT_LABEL.agree : VERDICT_LABEL.disagree) : PENDING_LABEL }}</td>
        </tr>
        <tr v-if="filtered.length === 0">
          <td colspan="7" class="muted" style="text-align:center">Žiadne prípady nezodpovedajú filtrom.</td>
        </tr>
      </tbody>
    </table>

    <p class="muted small" style="margin-top: 0.5rem">
      {{ filtered.length }} / {{ cases.length }} prípadov
    </p>
  </template>
</template>

<style scoped>
.col-id {
  font-variant-numeric: tabular-nums;
  color: var(--color-muted);
  width: 3rem;
}

.list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.filter-row th {
  padding: 0.35rem 0.75rem;
  background: var(--color-surface-soft);
  border-bottom: 2px solid var(--color-border-strong);
}

.filter-row select,
.filter-row :deep(.ars-trigger),
.filter-row :deep(.drp-wrap input) {
  padding: 0.25rem 0.4rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  width: 100%;
  box-shadow: none;
  box-sizing: border-box;
  height: 1.875rem;
}

.filter-row select:focus,
.filter-row :deep(.ars-trigger:focus),
.filter-row :deep(.drp-wrap input:focus) {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.range-pair {
  display: flex;
  gap: 0.25rem;
}
.range-pair input {
  min-width: 0;
}
</style>
