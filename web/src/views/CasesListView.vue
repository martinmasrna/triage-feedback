<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import AgeRangeSlider from "../components/AgeRangeSlider.vue";
import DateRangePicker from "../components/DateRangePicker.vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { formatAge, COLOR_LABEL, COLOR_ORDER, PENDING_LABEL, SOURCE_LABEL, VERDICT_LABEL } from "../labels";
import { useVocab } from "../vocab";
import type { Color, DoctorCase } from "../types";
import ColorChip from "../components/ColorChip.vue";

const router = useRouter();
const { complaintLabel } = useVocab();
const cases = ref<DoctorCase[]>([]);
const loading = ref(false);
const error = ref("");

// ── Filters ────────────────────────────────────────────────────────────────
const filter = reactive({
  dateFrom: "",
  dateTo: "",
  ageFromDays: null as number | null,
  ageToDays:   null as number | null,
  complaint: "",
  source: "" as "" | "doctor" | "ai_generated",
  color: "" as "" | Color,
  verdict: "" as "" | "agree" | "disagree" | "pending",
});

function ageInDays(c: DoctorCase): number {
  const { value, unit } = c.entered.age;
  return unit === "years" ? value * 365 : unit === "months" ? value * 30 : value;
}

const anyFilterActive = computed(() =>
  filter.dateFrom !== "" || filter.dateTo !== "" ||
  filter.ageFromDays !== null || filter.ageToDays !== null ||
  filter.complaint !== "" || filter.source !== "" ||
  filter.color !== "" || filter.verdict !== "" ||
  sortKey.value !== "time" || sortAsc.value,
);

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
type SortKey = "time" | "age" | "complaint" | "source" | "color" | "verdict";
const sortKey = ref<SortKey>("time");
const sortAsc = ref(false);

function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value;
  else { sortKey.value = key; sortAsc.value = false; }
}
function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return "";
  return sortAsc.value ? " ▲" : " ▼";
}

function verdictRank(c: DoctorCase): number {
  if (c.verdict === null) return 0;
  return c.verdict.agrees ? 1 : 2;
}

// ── Filtered + sorted list ─────────────────────────────────────────────────
const filtered = computed(() => {
  let list = cases.value;

  if (filter.dateFrom) {
    const from = new Date(filter.dateFrom).getTime();
    list = list.filter((c) => new Date(c.created_at).getTime() >= from);
  }
  if (filter.dateTo) {
    const to = new Date(filter.dateTo).getTime();
    list = list.filter((c) => new Date(c.created_at).getTime() <= to);
  }
  if (filter.ageFromDays !== null) list = list.filter((c) => ageInDays(c) >= filter.ageFromDays!);
  if (filter.ageToDays   !== null) list = list.filter((c) => ageInDays(c) <= filter.ageToDays!);
  if (filter.complaint) {
    list = list.filter((c) => c.entered.complaint_category === filter.complaint);
  }
  if (filter.source) {
    list = list.filter((c) => c.source === filter.source);
  }
  if (filter.color) {
    list = list.filter((c) => c.decision.color === filter.color);
  }
  if (filter.verdict) {
    if (filter.verdict === "pending") list = list.filter((c) => c.verdict === null);
    else if (filter.verdict === "agree") list = list.filter((c) => c.verdict?.agrees === true);
    else list = list.filter((c) => c.verdict?.agrees === false);
  }

  const sorted = [...list];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortKey.value) {
      case "age":       cmp = ageInDays(a) - ageInDays(b); break;
      case "complaint": cmp = complaintLabel(a.entered.complaint_category).localeCompare(complaintLabel(b.entered.complaint_category), "sk"); break;
      case "source":    cmp = a.source.localeCompare(b.source); break;
      case "color":     cmp = COLOR_ORDER.indexOf(a.decision.color) - COLOR_ORDER.indexOf(b.decision.color); break;
      case "verdict":   cmp = verdictRank(a) - verdictRank(b); break;
      default:          cmp = a.created_at.localeCompare(b.created_at); break;
    }
    return sortAsc.value ? cmp : -cmp;
  });
  return sorted;
});

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

load();

function formatTime(iso: string): string {
  const d = new Date(iso);
  const date = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  const time = d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}
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
          <th class="sortable" @click="toggleSort('time')">Čas{{ sortArrow("time") }}</th>
          <th class="sortable" @click="toggleSort('age')">Vek{{ sortArrow("age") }}</th>
          <th class="sortable" @click="toggleSort('complaint')">Dôvod{{ sortArrow("complaint") }}</th>
          <th class="sortable" @click="toggleSort('source')">Pôvod{{ sortArrow("source") }}</th>
          <th class="sortable" @click="toggleSort('color')">Systém{{ sortArrow("color") }}</th>
          <th class="sortable" @click="toggleSort('verdict')">Hodnotenie{{ sortArrow("verdict") }}</th>
        </tr>
        <tr class="filter-row">
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
          <td>{{ formatTime(c.created_at) }}</td>
          <td>{{ formatAge(c.entered.age.value, c.entered.age.unit) }}</td>
          <td>{{ complaintLabel(c.entered.complaint_category) }}</td>
          <td>{{ SOURCE_LABEL[c.source] }}</td>
          <td><ColorChip :color="c.decision.color" /></td>
          <td>{{ c.verdict ? (c.verdict.agrees ? VERDICT_LABEL.agree : VERDICT_LABEL.disagree) : PENDING_LABEL }}</td>
        </tr>
        <tr v-if="filtered.length === 0">
          <td colspan="6" class="muted" style="text-align:center">Žiadne prípady nezodpovedajú filtrom.</td>
        </tr>
      </tbody>
    </table>

    <p class="muted small" style="margin-top: 0.5rem">
      {{ filtered.length }} / {{ cases.length }} prípadov
    </p>
  </template>
</template>

<style scoped>
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
