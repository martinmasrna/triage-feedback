<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { groupDiscriminators } from "../discriminatorGroups";
import { newCaseSignal } from "../newCaseSignal";
import type {
  AgeUnit,
  DoctorCase,
  EnteredCase,
  EvaluateResponse,
  ExtractionResult,
  FormOptions,
  TriState,
} from "../types";
import { categoryIcon } from "../categoryIcons";
import CaseSummaryCard from "../components/CaseSummaryCard.vue";
import ColorChip from "../components/ColorChip.vue";
import RuleExplanation from "../components/RuleExplanation.vue";
import VerdictForm from "../components/VerdictForm.vue";
import VitalsForm from "../components/VitalsForm.vue";
import DiscriminatorsForm from "../components/DiscriminatorsForm.vue";

const router = useRouter();

const STEPS = ["Základné údaje", "Vitálne funkcie", "Klinické nálezy", "Výsledok a hodnotenie"];
const step = ref(1);
const maxStep = ref(1);
const options = ref<FormOptions | null>(null);
const error = ref("");

const form = reactive({
  ageValue: null as number | null,
  ageUnit: "years" as AgeUnit,
  complaint_category: "",
  complaint_text: "",
  note: "",
  vitals: {} as Record<string, number>,
  discriminators: {} as Record<string, TriState>,
});
const fieldErrors = reactive<{ age?: string; complaint?: string; complaintText?: string; note?: string }>({});

// ── Age slider ────────────────────────────────────────────────────────────
// A single "logarithmic" slider: 0–90 days (+1 day steps), then 4–36 months
// (+1 month steps), then 4–18 years (+1 year steps). 90 days and 36 months
// double as the 3-month / 3-year handover points.
const AGE_SLIDER_MAX = 90 + (36 - 3) + (18 - 3);

function ageToIndex(value: number, unit: AgeUnit): number {
  if (unit === "days") return Math.min(90, Math.max(0, value));
  if (unit === "months") return Math.min(123, Math.max(91, 90 + (value - 3)));
  return Math.min(AGE_SLIDER_MAX, Math.max(124, 123 + (value - 3)));
}

function indexToAge(index: number): { value: number; unit: AgeUnit } {
  if (index <= 90) return { value: index, unit: "days" };
  if (index <= 123) return { value: 3 + (index - 90), unit: "months" };
  return { value: 3 + (index - 123), unit: "years" };
}

const ageSliderIndex = computed<number>({
  get: () => (form.ageValue === null ? 0 : ageToIndex(form.ageValue, form.ageUnit)),
  set: (index) => {
    const { value, unit } = indexToAge(index);
    form.ageValue = value;
    form.ageUnit = unit;
  },
});

function pluralSk(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

const ageSliderLabel = computed(() => {
  const value = form.ageValue ?? 0;
  const unit = form.ageValue === null ? "days" : form.ageUnit;
  if (unit === "days") return `${value} ${pluralSk(value, "deň", "dni", "dní")}`;
  if (unit === "months") return `${value} ${pluralSk(value, "mesiac", "mesiace", "mesiacov")}`;
  return `${value} ${pluralSk(value, "rok", "roky", "rokov")}`;
});

// The note is read once, on the step 1 → 2 transition, to pre-fill vitals + discriminators. The
// result is kept and sent back at evaluate time so the original AI read is stored as-is, distinct
// from whatever the doctor ends up entering.
const extraction = ref<ExtractionResult | null>(null);
const extracting = ref(false);
// Signature of the step-1 inputs the current extraction was based on — lets us re-read only when
// the note/complaint actually changed, so navigating back and forward never clobbers doctor edits.
let extractedSig = "";

const draft = ref<EvaluateResponse | null>(null);
const evaluating = ref(false);
const agrees = ref<boolean | null>(null);
const comment = ref("");
const saving = ref(false);
const saved = ref<DoctorCase | null>(null);

// Step-1 readiness: drives the dimmed (but still clickable) "Ďalej" button.
const step1Valid = computed(
  () =>
    !!form.ageValue &&
    form.ageValue > 0 &&
    !!form.complaint_category &&
    (form.complaint_category !== "other" || !!form.complaint_text.trim()) &&
    !!form.note.trim(),
);

// Clear the "Iné" detail text (and its error) once the doctor picks a different reason.
watch(
  () => form.complaint_category,
  (category) => {
    if (category !== "other") {
      form.complaint_text = "";
      fieldErrors.complaintText = undefined;
    }
  },
);

const groups = computed(() => (options.value ? groupDiscriminators(options.value.discriminators) : []));

onMounted(async () => {
  try {
    options.value = await api.formOptions();
  } catch (e) {
    error.value = `Nepodarilo sa načítať formulár: ${(e as Error).message}`;
  }
});

// "Nový prípad" was clicked while already on this view — start over.
watch(newCaseSignal, () => reset());

function buildEntered(): EnteredCase {
  return {
    age: { value: Number(form.ageValue), unit: form.ageUnit },
    complaint_category: form.complaint_category,
    complaint_text: form.complaint_text.trim() || undefined,
    note: form.note.trim() || undefined,
    vitals: form.vitals,
    discriminators: form.discriminators,
  };
}

function validateStep1(): boolean {
  fieldErrors.age = !form.ageValue || form.ageValue <= 0 ? "Zadajte vek dieťaťa." : undefined;
  fieldErrors.complaint = !form.complaint_category ? "Vyberte dôvod príchodu." : undefined;
  fieldErrors.complaintText =
    form.complaint_category === "other" && !form.complaint_text.trim() ? "Spresnite dôvod príchodu." : undefined;
  fieldErrors.note = !form.note.trim() ? "Zadajte triážny záznam (poznámku)." : undefined;
  return !fieldErrors.age && !fieldErrors.complaint && !fieldErrors.complaintText && !fieldErrors.note;
}

async function next() {
  error.value = "";
  if (step.value === 1) {
    if (!validateStep1()) return;
    // Read the note before showing step 2 so vitals + discriminators land pre-filled.
    await runExtract();
  }
  if (step.value < 4) {
    step.value += 1;
    maxStep.value = Math.max(maxStep.value, step.value);
    // Entering the final step evaluates immediately — the result is the point of this screen.
    // Once evaluated, the case data is locked, so this only ever runs once.
    if (step.value === 4 && !draft.value) await runEvaluate();
  }
}

// Returns the signature of the step-1 inputs the extraction depends on (the note + complaint).
function step1Signature(): string {
  return JSON.stringify([form.complaint_category, form.complaint_text.trim(), form.note.trim()]);
}

// Read the note into structured findings and pre-fill the form. Never throws and never blocks
// progress: a read failure just means the doctor fills everything by hand (and step 4 flags it).
async function runExtract(): Promise<void> {
  const sig = step1Signature();
  if (extraction.value && sig === extractedSig) return; // inputs unchanged — keep current edits
  extracting.value = true;
  error.value = "";
  try {
    const result = await api.extract({
      age: { value: Number(form.ageValue), unit: form.ageUnit },
      complaint_category: form.complaint_category,
      complaint_text: form.complaint_text.trim() || undefined,
      note: form.note.trim() || undefined,
      vitals: {},
      discriminators: {},
    });
    extraction.value = result;
    form.vitals = { ...result.vitals };
    form.discriminators = { ...result.discriminators };
  } catch {
    extraction.value = null; // evaluate falls back to reading the note server-side
  } finally {
    extractedSig = sig;
    extracting.value = false;
  }
}

function back() {
  error.value = "";
  if (step.value > 1) step.value -= 1;
}

function goToStep(target: number) {
  if (target > maxStep.value || target === step.value) return;
  error.value = "";
  step.value = target;
}

// Once the case has been evaluated, the entered data can no longer change —
// only the agree/disagree verdict + comment remain editable until saved.
const locked = computed(() => draft.value !== null);

async function runEvaluate(): Promise<void> {
  evaluating.value = true;
  error.value = "";
  try {
    draft.value = await api.evaluate(buildEntered(), extraction.value);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    evaluating.value = false;
  }
}

const canSave = computed(() => !!draft.value && agrees.value !== null && !saving.value);

async function save() {
  if (!draft.value || agrees.value === null) return;
  saving.value = true;
  error.value = "";
  try {
    saved.value = await api.save(draft.value.draftId, {
      agrees: agrees.value,
      comment: comment.value.trim() || undefined,
    });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

function reset() {
  form.ageValue = null;
  form.ageUnit = "years";
  form.complaint_category = "";
  form.complaint_text = "";
  form.note = "";
  form.vitals = {};
  form.discriminators = {};
  fieldErrors.age = fieldErrors.complaint = fieldErrors.complaintText = fieldErrors.note = undefined;
  extraction.value = null;
  extracting.value = false;
  extractedSig = "";
  draft.value = null;
  evaluating.value = false;
  agrees.value = null;
  comment.value = "";
  saved.value = null;
  error.value = "";
  step.value = 1;
  maxStep.value = 1;
}
</script>

<template>
  <div class="wizard">
  <!-- ── Saved confirmation ──────────────────────────────────────────── -->
  <section v-if="saved">
    <div class="card">
      <h1>Prípad uložený ✓</h1>
      <p class="agreement">
        Systém: <ColorChip :color="saved.decision.color" /> · vaše hodnotenie:
        <strong>{{ saved.verdict!.agrees ? "súhlas" : "nesúhlas" }}</strong>
      </p>
      <div class="actions">
        <button type="button" class="btn btn-primary" @click="reset">Nový prípad</button>
        <button type="button" class="btn" @click="router.push(`/cases/${saved.id}`)">Zobraziť detail</button>
        <button type="button" class="btn btn-ghost" @click="router.push('/cases')">Moje prípady</button>
      </div>
    </div>
  </section>

  <template v-else>
    <!-- Stepper -->
    <div class="stepper">
      <template v-for="(label, i) in STEPS" :key="i">
        <button
          v-if="i + 1 !== step && i + 1 <= maxStep"
          type="button"
          class="step step-link done"
          @click="goToStep(i + 1)"
        >
          <span class="step-num">{{ i + 1 }}</span>
          <span>{{ label }}</span>
        </button>
        <div v-else class="step" :class="{ active: step === i + 1 }">
          <span class="step-num">{{ i + 1 }}</span>
          <span>{{ label }}</span>
        </div>
        <span v-if="i < STEPS.length - 1" class="step-sep"></span>
      </template>
    </div>

    <div v-if="error" class="banner banner-error">{{ error }}</div>

    <template v-if="options">
      <!-- STEP 1: BASIC INFO -->
      <div v-show="step === 1" class="card">
        <section class="form-section">
          <h3 class="section-label">Vek <span class="req">*</span></h3>
          <div class="age-slider-row" :class="{ invalid: fieldErrors.age }">
            <button
              type="button"
              class="age-slider-btn age-slider-btn--minus"
              tabindex="-1"
              aria-label="Znížiť vek"
              :disabled="ageSliderIndex <= 0 || locked"
              @click="ageSliderIndex = Math.max(0, ageSliderIndex - 1)"
            ></button>
            <div class="age-slider-wrap">
              <input
                class="age-slider"
                type="range"
                min="0"
                :max="AGE_SLIDER_MAX"
                step="1"
                :disabled="locked"
                v-model.number="ageSliderIndex"
              />
            </div>
            <button
              type="button"
              class="age-slider-btn age-slider-btn--plus"
              tabindex="-1"
              aria-label="Zvýšiť vek"
              :disabled="ageSliderIndex >= AGE_SLIDER_MAX || locked"
              @click="ageSliderIndex = Math.min(AGE_SLIDER_MAX, ageSliderIndex + 1)"
            ></button>
            <div class="age-slider-value">{{ ageSliderLabel }}</div>
          </div>
          <span v-if="fieldErrors.age" class="field-error">{{ fieldErrors.age }}</span>
        </section>

        <section class="form-section">
          <h3 class="section-label">Dôvod príchodu <span class="req">*</span></h3>
          <div class="complaint-grid" :class="{ invalid: fieldErrors.complaint }">
            <button
              v-for="c in options.complaint_categories"
              :key="c.key"
              type="button"
              class="complaint-btn"
              :class="{ selected: form.complaint_category === c.key }"
              :disabled="locked"
              @click="form.complaint_category = c.key"
            >
              <component :is="categoryIcon(c.key)" :size="32" :stroke-width="1.8" />
              <span>{{ c.label_sk }}</span>
            </button>
          </div>
          <span v-if="fieldErrors.complaint" class="field-error">{{ fieldErrors.complaint }}</span>

          <label v-if="form.complaint_category === 'other'" class="field">
            <span>Spresnite dôvod <span class="req">*</span></span>
            <input
              type="text"
              v-model="form.complaint_text"
              placeholder="napr. kontrola po úraze"
              :class="{ invalid: fieldErrors.complaintText }"
              :disabled="locked"
            />
            <span v-if="fieldErrors.complaintText" class="field-error">{{ fieldErrors.complaintText }}</span>
          </label>
        </section>

        <section class="form-section">
          <h3 class="section-label">Triážny záznam <span class="req">*</span></h3>
          <textarea
            v-model="form.note"
            rows="3"
            placeholder="Krátka poznámka ako pri reálnej triáži, vrátane podrobností (napr. typ a závažnosť úrazu)."
            :class="{ invalid: fieldErrors.note }"
            :disabled="locked"
          ></textarea>
          <span v-if="fieldErrors.note" class="field-error">{{ fieldErrors.note }}</span>
        </section>

        <div class="actions actions-end">
          <button
            type="button"
            class="btn btn-primary"
            :class="{ 'is-dim': !step1Valid }"
            :disabled="extracting"
            @click="next"
          >
            <template v-if="extracting"><span class="spinner"></span> Čítam záznam…</template>
            <template v-else>Ďalej →</template>
          </button>
        </div>
      </div>

      <!-- STEP 2: VITALS -->
      <div v-show="step === 2" class="card">
        <h3 class="step-title">Vitálne funkcie <span class="muted small">(voliteľné)</span></h3>
        <VitalsForm :vitals="options.vitals" v-model="form.vitals" :disabled="locked" />
        <div class="actions actions-split">
          <button type="button" class="btn btn-ghost" @click="back">← Späť</button>
          <button type="button" class="btn btn-primary" @click="next">Ďalej →</button>
        </div>
      </div>

      <!-- STEP 3: FINDINGS (grouped) -->
      <div v-show="step === 3" class="card">
        <h3 class="step-title">Klinické nálezy <span class="muted small">(voliteľné)</span></h3>
        <div v-for="g in groups" :key="g.title_sk" class="finding-group-wrap">
          <div class="group-title">{{ g.title_sk }}</div>
          <div class="finding-group">
            <DiscriminatorsForm :rows="g.rows" v-model="form.discriminators" :disabled="locked" />
          </div>
        </div>
        <div class="actions actions-split">
          <button type="button" class="btn btn-ghost" @click="back">← Späť</button>
          <button type="button" class="btn btn-primary" @click="next">Vyhodnotiť prípad →</button>
        </div>
      </div>

      <!-- STEP 4: SYSTEM RESULT + FEEDBACK -->
      <div v-show="step === 4">
        <CaseSummaryCard
          title="Zhrnutie zadaných údajov"
          :age="{ value: form.ageValue ?? 0, unit: form.ageUnit }"
          :complaint-category="form.complaint_category"
          :complaint-text="form.complaint_text"
          :note="form.note"
          :vitals="form.vitals"
          :discriminators="form.discriminators"
        >
          <template #actions>
            <div class="actions">
              <button type="button" class="btn btn-ghost" @click="back" :disabled="evaluating || saving">← Späť (upraviť údaje)</button>
            </div>
          </template>
        </CaseSummaryCard>

        <!-- Evaluating -->
        <div v-if="evaluating" class="card">
          <div class="loading-row"><span class="spinner"></span> Vyhodnocujem prípad…</div>
        </div>

        <!-- System result + agree/disagree feedback -->
        <template v-if="!evaluating && draft">
          <div v-if="!draft.extraction_ok" class="banner banner-warn">
            Systém nedokázal spoľahlivo prečítať poznámku. Rozhodnutie vychádza zo štruktúrovaných polí.
          </div>

          <div class="card">
            <RuleExplanation :decision="draft.decision" />
          </div>

          <VerdictForm
            v-model:agrees="agrees"
            v-model:comment="comment"
            :submitting="saving"
            :can-submit="canSave"
            submit-label="Uložiť prípad"
            @submit="save"
          />
        </template>
      </div>
    </template>
  </template>
  </div>
</template>
