<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { formatAge, PENDING_LABEL, SOURCE_LABEL, VERDICT_LABEL } from "../labels";
import { useVocab } from "../vocab";
import type { StoredCase } from "../types";
import ColorChip from "../components/ColorChip.vue";

const router = useRouter();
const { complaintLabel } = useVocab();
const cases = ref<StoredCase[]>([]);
const loading = ref(false);
const error = ref("");

const filter = reactive<{ disagreementsOnly: boolean }>({
  disagreementsOnly: false,
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    cases.value = await api.adminList({
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
  <div class="flex items-center gap-3">
    <h1>Admin · všetky prípady</h1>
    <RouterLink to="/cases" class="btn btn-sm btn-ghost">← Pohľad lekára</RouterLink>
  </div>
  <p class="muted small">Úplný záznam vrátane tichého druhého názoru a extrakcie. Len pre výskum.</p>

  <div class="card toolbar">
    <label class="inline"><input type="checkbox" v-model="filter.disagreementsOnly" /> Iba nesúhlasy</label>
    <span class="spacer"></span>
    <a class="btn btn-sm" href="/api/admin/export.json">Export JSON</a>
    <a class="btn btn-sm" href="/api/admin/export.csv">Export CSV</a>
  </div>

  <div v-if="error" class="banner banner-error">{{ error }}</div>
  <p v-if="loading" class="muted">Načítavam…</p>
  <p v-else-if="cases.length === 0" class="muted">Zatiaľ žiadne prípady.</p>

  <table v-else class="cases">
    <thead>
      <tr>
        <th>Čas</th>
        <th>Vek</th>
        <th>Dôvod</th>
        <th>Pôvod</th>
        <th>Systém</th>
        <th>2. názor</th>
        <th>Hodnotenie</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in cases" :key="c.id" class="clickable" @click="router.push(`/admin/cases/${c.id}`)">
        <td>{{ formatTime(c.created_at) }}</td>
        <td>{{ formatAge(c.entered.age.value, c.entered.age.unit) }}</td>
        <td>{{ complaintLabel(c.entered.complaint_category) }}</td>
        <td>{{ SOURCE_LABEL[c.source] }}</td>
        <td><ColorChip :color="c.decision.color" /></td>
        <td><ColorChip v-if="c.second_opinion" :color="c.second_opinion.color" /><span v-else class="muted">—</span></td>
        <td>{{ c.verdict ? (c.verdict.agrees ? VERDICT_LABEL.agree : VERDICT_LABEL.disagree) : PENDING_LABEL }}</td>
      </tr>
    </tbody>
  </table>

  <p v-if="cases.length" class="muted small" style="margin-top: 0.5rem">{{ cases.length }} prípadov</p>
</template>
