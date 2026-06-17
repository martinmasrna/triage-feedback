<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import flatpickr from "flatpickr";
import { Slovak } from "flatpickr/dist/l10n/sk";
import "flatpickr/dist/flatpickr.min.css";

const emit = defineEmits<{
  change: [{ from: string | null; to: string | null }];
}>();

const fromDate = ref<Date | null>(null);
const toDate   = ref<Date | null>(null);
const fromHour = ref("00");
const fromMin  = ref("00");
const toHour   = ref("23");
const toMin    = ref("59");

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const open        = ref(false);
const triggerEl   = ref<HTMLInputElement | null>(null);
const calendarEl  = ref<HTMLElement | null>(null);
const popupStyle  = ref<Record<string, string>>({});
let fp: ReturnType<typeof flatpickr> | null = null;

watch(calendarEl, (el) => {
  if (el && !fp) {
    fp = flatpickr(el, {
      inline: true,
      mode: "range",
      locale: { ...Slovak, rangeSeparator: " – " },
      onChange(dates) {
        fromDate.value = dates[0] ?? null;
        toDate.value   = dates[1] ?? null;
        emitChange();
      },
    });
  }
  if (!el && fp) {
    if (!Array.isArray(fp)) fp.destroy();
    fp = null;
  }
});

function combineDatetime(date: Date, hour: string, min: string, sec: number, ms = 0): Date {
  const d = new Date(date);
  d.setHours(Number(hour), Number(min), sec, ms);
  return d;
}

function emitChange() {
  const from = fromDate.value ? combineDatetime(fromDate.value, fromHour.value, fromMin.value,  0) : null;
  const to   = toDate.value   ? combineDatetime(toDate.value,   toHour.value,   toMin.value,   59, 999) : null;
  emit("change", { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null });
}

function reset() {
  fromDate.value = null;
  toDate.value   = null;
  fromHour.value = "00";
  fromMin.value  = "00";
  toHour.value   = "23";
  toMin.value    = "59";
  if (fp && !Array.isArray(fp)) fp.clear();
  emitChange();
}

defineExpose({ reset });

function fmtDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

const label = computed(() => {
  if (!fromDate.value) return "";
  const from = `${fmtDate(fromDate.value)} ${fromHour.value}:${fromMin.value}`;
  if (!toDate.value) return from;
  return `${from} – ${fmtDate(toDate.value)} ${toHour.value}:${toMin.value}`;
});

function updatePosition() {
  if (!triggerEl.value) return;
  const r = triggerEl.value.getBoundingClientRect();
  popupStyle.value = { position: "fixed", top: `${r.bottom + 6}px`, left: `${r.left}px` };
}

function onClickOutside(e: MouseEvent) {
  const popup = document.querySelector(".drp-popup");
  if (!triggerEl.value?.contains(e.target as Node) && !popup?.contains(e.target as Node)) {
    close();
  }
}

function close() {
  open.value = false;
  document.removeEventListener("mousedown", onClickOutside);
}

function toggleOpen() {
  if (open.value) { close(); return; }
  open.value = true;
  nextTick(() => {
    updatePosition();
    document.addEventListener("mousedown", onClickOutside);
  });
}

onUnmounted(() => {
  document.removeEventListener("mousedown", onClickOutside);
  if (fp && !Array.isArray(fp)) fp.destroy();
});
</script>

<template>
  <div class="drp-wrap">
    <input
      ref="triggerEl"
      type="text"
      :value="label"
      placeholder="Rozsah dátumov…"
      readonly
      style="cursor:pointer"
      @mousedown.prevent="toggleOpen"
    />

    <Teleport to="body">
      <div v-if="open" class="drp-popup" :style="popupStyle">
        <div ref="calendarEl" class="drp-calendar" />

        <div class="drp-times">
          <div class="drp-time-row">
            <span class="drp-time-label">Od</span>
            <span class="drp-time-date">{{ fromDate ? fmtDate(fromDate) : '—' }}</span>
            <div class="drp-time-selects" :class="{ disabled: !fromDate }">
              <select :disabled="!fromDate" :value="fromHour" @change="e => { fromHour = (e.target as HTMLSelectElement).value; emitChange(); }">
                <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
              </select>
              <span class="drp-time-sep">:</span>
              <select :disabled="!fromDate" :value="fromMin" @change="e => { fromMin = (e.target as HTMLSelectElement).value; emitChange(); }">
                <option v-for="m in MINUTES" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>
          <div class="drp-time-row">
            <span class="drp-time-label">Do</span>
            <span class="drp-time-date">{{ toDate ? fmtDate(toDate) : '—' }}</span>
            <div class="drp-time-selects" :class="{ disabled: !toDate }">
              <select :disabled="!toDate" :value="toHour" @change="e => { toHour = (e.target as HTMLSelectElement).value; emitChange(); }">
                <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
              </select>
              <span class="drp-time-sep">:</span>
              <select :disabled="!toDate" :value="toMin" @change="e => { toMin = (e.target as HTMLSelectElement).value; emitChange(); }">
                <option v-for="m in MINUTES" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.drp-wrap {
  position: relative;
}

.drp-popup {
  z-index: 9999;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.08);
  padding: 0.75rem;
  width: fit-content;
}

/* Strip flatpickr's own outer border/shadow since we provide them */
.drp-calendar :deep(.flatpickr-calendar) {
  box-shadow: none;
  border: none;
  margin: 0;
}

.drp-times {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.drp-time-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.drp-time-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  width: 1.5rem;
  flex: none;
}

.drp-time-date {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
  width: 5rem;
  flex: none;
}

.drp-time-selects {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.drp-time-selects select {
  font-size: 0.8rem;
  padding: 0.2rem 0.25rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
  width: 3.2rem;
  cursor: pointer;
}

.drp-time-sep {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-muted);
  line-height: 1;
}

.drp-time-selects.disabled select {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
