<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
import { AGE_SLIDER_MAX, indexToAge, indexToDays } from "../services/ageSlider";
import { formatAge } from "../assets/labels";

const emit = defineEmits<{
  change: [{ fromDays: number | null; toDays: number | null }];
}>();

const fromIndex = ref(0);
const toIndex = ref(AGE_SLIDER_MAX);
const open = ref(false);
const triggerEl = ref<HTMLInputElement | null>(null);
const popupStyle = ref<Record<string, string>>({});

function onFrom(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  fromIndex.value = Math.min(v, toIndex.value);
  emitChange();
}

function onTo(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  toIndex.value = Math.max(v, fromIndex.value);
  emitChange();
}

function emitChange() {
  const isDefault = fromIndex.value === 0 && toIndex.value === AGE_SLIDER_MAX;
  emit("change", {
    fromDays: isDefault ? null : indexToDays(fromIndex.value),
    toDays:   isDefault ? null : indexToDays(toIndex.value),
  });
}

function reset() {
  fromIndex.value = 0;
  toIndex.value = AGE_SLIDER_MAX;
  emitChange();
}

defineExpose({ reset });

const label = computed(() => {
  if (fromIndex.value === 0 && toIndex.value === AGE_SLIDER_MAX) return "";
  const from = indexToAge(fromIndex.value);
  const to   = indexToAge(toIndex.value);
  if (fromIndex.value === 0)            return `do ${formatAge(to.value, to.unit)}`;
  if (toIndex.value === AGE_SLIDER_MAX) return `od ${formatAge(from.value, from.unit)}`;
  return `${formatAge(from.value, from.unit)} – ${formatAge(to.value, to.unit)}`;
});

const fromLabel = computed(() => { const a = indexToAge(fromIndex.value); return formatAge(a.value, a.unit); });
const toLabel   = computed(() => { const a = indexToAge(toIndex.value);   return formatAge(a.value, a.unit); });

const fillStyle = computed(() => ({
  left:  `${(fromIndex.value / AGE_SLIDER_MAX) * 100}%`,
  right: `${(1 - toIndex.value / AGE_SLIDER_MAX) * 100}%`,
}));

function updatePosition() {
  if (!triggerEl.value) return;
  const r = triggerEl.value.getBoundingClientRect();
  popupStyle.value = {
    position: "fixed",
    top:  `${r.bottom + 6}px`,
    left: `${r.left}px`,
    width: "30rem",
  };
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  const popup = document.querySelector(".ars-popup");
  if (!triggerEl.value?.contains(target) && !popup?.contains(target)) {
    close();
  }
}

function close() {
  open.value = false;
  document.removeEventListener("mousedown", onClickOutside);
}

function toggleOpen() {
  if (open.value) {
    close();
  } else {
    open.value = true;
    nextTick(updatePosition);
    document.addEventListener("mousedown", onClickOutside);
  }
}

onUnmounted(() => document.removeEventListener("mousedown", onClickOutside));
</script>

<template>
  <div class="ars-wrap">
    <input
      ref="triggerEl"
      type="text"
      class="ars-trigger"
      :value="label"
      placeholder="Rozsah veku…"
      readonly
      @mousedown.prevent="toggleOpen"
    />

    <Teleport to="body">
      <div v-if="open" class="ars-popup" :style="popupStyle">
        <div class="ars-labels">
          <span>{{ fromLabel }}</span>
          <span>{{ toLabel }}</span>
        </div>
        <div class="age-slider-wrap ars-track">
          <div class="age-range-fill" :style="fillStyle" />
          <input
            class="age-slider"
            type="range"
            min="0"
            :max="AGE_SLIDER_MAX"
            step="1"
            :value="fromIndex"
            :style="{ zIndex: fromIndex >= toIndex ? 3 : 1 }"
            @input="onFrom"
          />
          <input
            class="age-slider"
            type="range"
            min="0"
            :max="AGE_SLIDER_MAX"
            step="1"
            :value="toIndex"
            :style="{ zIndex: fromIndex >= toIndex ? 1 : 3 }"
            @input="onTo"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ars-wrap {
  position: relative;
}

.ars-trigger {
  cursor: pointer;
}

.ars-popup {
  z-index: 9999;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.08);
  padding: 1rem 1.25rem 1.25rem;
}

.ars-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary-hover);
  margin-bottom: 0.6rem;
}

.ars-track {
  flex: 1;
  --thumb: 1.25rem;
  --rail: 6px;
  height: var(--rail);
  border-radius: 999px;
  background: transparent;
}

.age-range-fill {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: var(--rail);
  background: var(--color-primary);
  border-radius: 999px;
  pointer-events: none;
}

/* Only the thumb handles are interactive — this lets both overlapping inputs
   coexist without the top one swallowing all track clicks. */
.age-slider {
  pointer-events: none;
}
.age-slider::-webkit-slider-thumb {
  pointer-events: all;
}
.age-slider::-moz-range-thumb {
  pointer-events: all;
}
</style>
