<script setup lang="ts">
import { ref } from "vue";
import { formatAge } from "../assets/labels";
import { useVocab } from "../services/vocab";
import type { DoctorCase } from "../interfaces/types";

const props = withDefaults(
  defineProps<{
    label: string;
    cases: DoctorCase[];
    emptyText: string;
    showCount?: boolean;
    defaultOpen?: boolean;
  }>(),
  { showCount: false, defaultOpen: false },
);

const { complaintLabel } = useVocab();
const open = ref(props.defaultOpen);

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
  <div class="side-group">
    <div class="group-head" @click="open = !open">
      <slot name="icon" />
      {{ label }}
      <span v-if="showCount && cases.length" class="count">{{ cases.length }}</span>
      <svg class="chev" :class="{ collapsed: !open }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
    </div>

    <div v-show="open" class="case-list">
      <RouterLink v-for="c in cases" :key="c.id" :to="`/cases/${c.id}`" class="case-row">
        <span class="swatch" :class="`s-${c.decision.color.toLowerCase()}`"></span>
        <span class="case-meta">
          <span class="ttl">{{ caseTitle(c) }}</span>
          <span class="sub">{{ relativeTime(c.created_at) }}</span>
        </span>
      </RouterLink>
      <p v-if="!cases.length" class="side-empty">{{ emptyText }}</p>
    </div>
  </div>
</template>
