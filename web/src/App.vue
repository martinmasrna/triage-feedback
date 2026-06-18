<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Stethoscope } from "lucide-vue-next";
import { api } from "./api";
import { formatAge } from "./labels";
import { useVocab } from "./vocab";
import { requestNewCase } from "./newCaseSignal";
import type { DoctorCase } from "./types";

const route = useRoute();
const { complaintLabel } = useVocab();

const pending = ref<DoctorCase[]>([]);
const evaluated = ref<DoctorCase[]>([]);
const own = ref<DoctorCase[]>([]);
const pendingExpanded = ref(true);
const evaluatedExpanded = ref(false);
const ownExpanded = ref(true);
const sidebarCollapsed = ref(localStorage.getItem("sidebarCollapsed") === "1");

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem("sidebarCollapsed", sidebarCollapsed.value ? "1" : "0");
}

async function loadRecent() {
  try {
    const all = await api.list();
    all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    pending.value = all.filter((c) => c.verdict === null);
    evaluated.value = all.filter((c) => c.source === "ai_generated" && c.verdict !== null);
    own.value = all.filter((c) => c.source === "doctor");
  } catch {
    // Sidebar is non-critical; stay silent and leave the lists empty.
  }
}

// Refresh whenever navigation lands somewhere (covers "saved a new case" → list/detail).
watch(() => route.fullPath, loadRecent, { immediate: true });


function caseTitle(c: DoctorCase): string {
  return `${formatAge(c.entered.age.value, c.entered.age.unit)} · ${complaintLabel(c.entered.complaint_category)}`;
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

        <RouterLink to="/cases" class="nav-item" :title="sidebarCollapsed ? 'Všetky prípady' : undefined">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          <span v-if="!sidebarCollapsed">Všetky prípady</span>
        </RouterLink>

        <template v-if="!sidebarCollapsed">
          <!-- AI-prefilled cases awaiting the doctor's verdict. -->
          <div class="side-group">
            <div class="group-head" @click="pendingExpanded = !pendingExpanded">
              <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
              Na posúdenie
              <span v-if="pending.length" class="count">{{ pending.length }}</span>
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
            </div>
          </div>

          <!-- AI-generated cases the doctor has already evaluated. -->
          <div class="side-group">
            <div class="group-head" @click="evaluatedExpanded = !evaluatedExpanded">
              <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="9 12 11 14 15 10" /></svg>
              Posúdené
              <svg class="chev" :class="{ collapsed: !evaluatedExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>

            <div v-show="evaluatedExpanded" class="case-list">
              <RouterLink v-for="c in evaluated" :key="c.id" :to="`/cases/${c.id}`" class="case-row">
                <span class="swatch" :class="`s-${c.decision.color.toLowerCase()}`"></span>
                <span class="case-meta">
                  <span class="ttl">{{ caseTitle(c) }}</span>
                  <span class="sub">{{ relativeTime(c.created_at) }}</span>
                </span>
              </RouterLink>
              <p v-if="!evaluated.length" class="side-empty">Žiadne posúdené prípady.</p>
            </div>
          </div>

          <!-- Cases entered manually by the doctor. -->
          <div class="side-group">
            <div class="group-head" @click="ownExpanded = !ownExpanded">
              <Stethoscope class="ic" :stroke-width="2.2" />
              Vlastné prípady
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
            </div>
          </div>
        </template>
      </div>
    </aside>

    <!-- ── Content panel ────────────────────────────────────────────────── -->
    <div class="panel">
      <main class="page-container" :class="{ 'page-container--wide': route.name === 'cases' }">
        <RouterView v-slot="{ Component }">
          <keep-alive include="CasesListView">
            <component :is="Component" />
          </keep-alive>
        </RouterView>
      </main>
    </div>
  </div>
</template>
