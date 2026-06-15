<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { PENDING_LABEL, SOURCE_LABEL, VERDICT_LABEL } from "../labels";
import { useVocab } from "../vocab";
import type { DoctorCase } from "../types";
import ColorChip from "../components/ColorChip.vue";

const router = useRouter();
const { complaintLabel } = useVocab();
const cases = ref<DoctorCase[]>([]);
const loading = ref(false);
const error = ref("");

const filter = reactive<{ disagreementsOnly: boolean }>({
  disagreementsOnly: false,
});

type SortKey = "time" | "age";
const sortKey = ref<SortKey>("time");
const sortAsc = ref(false);

function ageInDays(c: DoctorCase): number {
  const { value, unit } = c.entered.age;
  return unit === "years" ? value * 365 : unit === "months" ? value * 30 : value;
}

const sorted = computed(() => {
  const list = [...cases.value];
  list.sort((a, b) => {
    const cmp =
      sortKey.value === "age"
        ? ageInDays(a) - ageInDays(b)
        : a.created_at.localeCompare(b.created_at);
    return sortAsc.value ? cmp : -cmp;
  });
  return list;
});

function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value;
  else {
    sortKey.value = key;
    sortAsc.value = false;
  }
}
function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return "";
  return sortAsc.value ? " ▲" : " ▼";
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    cases.value = await api.list({
      disagreementsOnly: filter.disagreementsOnly || undefined,
    });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(filter, load);

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("sk-SK");
}
</script>

<template>
  <h1>Moje prípady</h1>

  <div class="card toolbar">
    <label class="inline"><input type="checkbox" v-model="filter.disagreementsOnly" /> Iba nesúhlasy</label>
  </div>

  <div v-if="error" class="banner banner-error">{{ error }}</div>
  <p v-if="loading" class="muted">Načítavam…</p>

  <div v-else-if="cases.length === 0" class="card">
    <p class="muted">Zatiaľ žiadne prípady. Začnite vytvorením nového prípadu.</p>
    <div class="actions">
      <button type="button" class="btn btn-primary" @click="router.push('/')">Nový prípad</button>
    </div>
  </div>

  <table v-else class="cases">
    <thead>
      <tr>
        <th class="sortable" @click="toggleSort('time')">Čas{{ sortArrow("time") }}</th>
        <th class="sortable" @click="toggleSort('age')">Vek{{ sortArrow("age") }}</th>
        <th>Dôvod</th>
        <th>Pôvod</th>
        <th>Systém</th>
        <th>Hodnotenie</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in sorted" :key="c.id" class="clickable" @click="router.push(`/cases/${c.id}`)">
        <td>{{ formatTime(c.created_at) }}</td>
        <td>{{ c.entered.age.value }} {{ c.entered.age.unit }}</td>
        <td>{{ complaintLabel(c.entered.complaint_category) }}</td>
        <td>{{ SOURCE_LABEL[c.source] }}</td>
        <td><ColorChip :color="c.decision.color" /></td>
        <td>{{ c.verdict ? (c.verdict.agrees ? VERDICT_LABEL.agree : VERDICT_LABEL.disagree) : PENDING_LABEL }}</td>
      </tr>
    </tbody>
  </table>

  <p v-if="cases.length" class="muted small" style="margin-top: 0.5rem">{{ cases.length }} prípadov</p>
</template>
