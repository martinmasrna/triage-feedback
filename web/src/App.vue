<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "./api";
import { useVocab } from "./vocab";
import { requestNewCase } from "./newCaseSignal";
import type { AgeUnit, DoctorCase } from "./types";

const route = useRoute();
const { complaintLabel } = useVocab();

const RECENT_LIMIT = 6;
const AGE_UNIT_SHORT: Record<AgeUnit, string> = { days: "dní", months: "mes.", years: "r." };

const pending = ref<DoctorCase[]>([]);
const pendingTotal = ref(0);
const own = ref<DoctorCase[]>([]);
const ownTotal = ref(0);
const pendingExpanded = ref(true);
const ownExpanded = ref(true);
const sidebarCollapsed = ref(localStorage.getItem("sidebarCollapsed") === "1");

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem("sidebarCollapsed", sidebarCollapsed.value ? "1" : "0");
}

async function loadRecent() {
  try {
    const all = await api.list();
    // Server returns newest-first; guard with a sort in case that ever changes.
    all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    // Pending = AI-prefilled, pre-triaged cases awaiting the doctor's verdict.
    const pendingAll = all.filter((c) => c.verdict === null);
    const ownAll = all.filter((c) => c.verdict !== null);
    pendingTotal.value = pendingAll.length;
    ownTotal.value = ownAll.length;
    pending.value = pendingAll.slice(0, RECENT_LIMIT);
    own.value = ownAll.slice(0, RECENT_LIMIT);
  } catch {
    // Sidebar is non-critical; stay silent and leave the lists empty.
  }
}

// Refresh whenever navigation lands somewhere (covers "saved a new case" → list/detail).
watch(() => route.fullPath, loadRecent, { immediate: true });

const crumb = computed(() => {
  switch (route.name) {
    case "new":
      return { section: "Prípady", page: "Nový prípad" };
    case "cases":
      return { section: "Prípady", page: "Vlastné prípady" };
    case "case":
      return { section: "Vlastné prípady", page: "Detail prípadu" };
    case "admin-cases":
      return { section: "Admin", page: "Prípady" };
    case "admin-case":
      return { section: "Admin", page: "Detail prípadu" };
    default:
      return { section: "Prípady", page: "" };
  }
});

function caseTitle(c: DoctorCase): string {
  return `${c.entered.age.value} ${AGE_UNIT_SHORT[c.entered.age.unit]} · ${complaintLabel(c.entered.complaint_category)}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((now.getTime() - then.getTime()) / 60000);
  if (diffMin < 1) return "teraz";
  if (diffMin < 60) return `pred ${diffMin} min`;
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) return `dnes ${then.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return "včera";
  return then.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="side-brand">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2 5 4-12 2 7h6" /></svg>
        </span>
        <span class="bt" v-if="!sidebarCollapsed">
          <strong>Triáž – spätná väzba</strong>
        </span>
        <button
          type="button"
          class="side-toggle"
          :title="sidebarCollapsed ? 'Rozbaliť bočný panel' : 'Zbaliť bočný panel'"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
      </div>

      <div class="side-scroll">
        <RouterLink
          to="/"
          class="nav-item"
          :title="sidebarCollapsed ? 'Nový prípad' : undefined"
          @click="route.path === '/' && requestNewCase()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          <span v-if="!sidebarCollapsed">Nový prípad</span>
        </RouterLink>

        <RouterLink v-if="sidebarCollapsed" to="/cases" class="nav-item" title="Prípady">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        </RouterLink>

        <template v-else>
          <!-- AI-prefilled, pre-triaged cases awaiting the doctor's verdict. -->
          <div class="side-group">
            <div class="group-head" @click="pendingExpanded = !pendingExpanded">
              <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
              Na posúdenie
              <span v-if="pendingTotal" class="count">{{ pendingTotal }}</span>
              <svg class="chev" :class="{ collapsed: !pendingExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>

            <div v-show="pendingExpanded" class="case-list">
              <RouterLink v-for="c in pending" :key="c.id" :to="`/cases/${c.id}`" class="case-row">
                <span class="swatch" :class="`s-${c.decision.color.toLowerCase()}`"></span>
                <span class="case-meta">
                  <span class="ttl">{{ caseTitle(c) }}</span>
                  <span class="sub">{{ relativeTime(c.created_at) }}</span>
                </span>
              </RouterLink>
              <p v-if="!pending.length" class="side-empty">Žiadne prípady na posúdenie.</p>
              <RouterLink v-if="pendingTotal > pending.length" to="/cases" class="see-all">Zobraziť všetky →</RouterLink>
            </div>
          </div>

          <!-- Cases the doctor has already reviewed (entered and/or given a verdict on). -->
          <div class="side-group">
            <div class="group-head" @click="ownExpanded = !ownExpanded">
              <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
              Vlastné prípady
              <span v-if="ownTotal" class="count">{{ ownTotal }}</span>
              <svg class="chev" :class="{ collapsed: !ownExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>

            <div v-show="ownExpanded" class="case-list">
              <RouterLink v-for="c in own" :key="c.id" :to="`/cases/${c.id}`" class="case-row">
                <span class="swatch" :class="`s-${c.decision.color.toLowerCase()}`"></span>
                <span class="case-meta">
                  <span class="ttl">{{ caseTitle(c) }}</span>
                  <span class="sub">{{ relativeTime(c.created_at) }}</span>
                </span>
              </RouterLink>
              <p v-if="!own.length" class="side-empty">Zatiaľ žiadne prípady.</p>
              <RouterLink v-if="ownTotal > own.length" to="/cases" class="see-all">Zobraziť všetky →</RouterLink>
            </div>
          </div>
        </template>
      </div>
    </aside>

    <!-- ── Content panel ────────────────────────────────────────────────── -->
    <div class="panel">
      <div class="topbar">
        <span class="crumb">{{ crumb.section }} <template v-if="crumb.page">/ <b>{{ crumb.page }}</b></template></span>
      </div>

      <main class="page-container">
        <RouterView />
      </main>
    </div>
  </div>
</template>
