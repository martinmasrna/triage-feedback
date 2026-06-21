<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Stethoscope } from "lucide-vue-next";
import { api } from "./services/api";
import SideGroup from "./components/SideGroup.vue";
import type { DoctorCase } from "./interfaces/types";

const route = useRoute();

const pending = ref<DoctorCase[]>([]);
const evaluated = ref<DoctorCase[]>([]);
const own = ref<DoctorCase[]>([]);
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
    evaluated.value = all.filter((c) => c.verdict !== null);
    own.value = all.filter((c) => c.source === "doctor");
  } catch {
    // Sidebar is non-critical; stay silent and leave the lists empty.
  }
}

// Refresh whenever navigation lands somewhere (covers "saved a new case" → list/detail).
watch(() => route.fullPath, loadRecent, { immediate: true });
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
          <SideGroup :cases="pending" label="Na posúdenie" empty-text="Žiadne prípady na posúdenie." show-count default-open>
            <template #icon>
              <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
            </template>
          </SideGroup>

          <!-- AI-generated cases the doctor has already evaluated. -->
          <SideGroup :cases="evaluated" label="Posúdené" empty-text="Žiadne posúdené prípady.">
            <template #icon>
              <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="9 12 11 14 15 10" /></svg>
            </template>
          </SideGroup>

          <!-- Cases entered manually by the doctor. -->
          <SideGroup :cases="own" label="Vlastné prípady" empty-text="Zatiaľ žiadne prípady." default-open>
            <template #icon>
              <Stethoscope class="ic" :stroke-width="2.2" />
            </template>
          </SideGroup>
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
