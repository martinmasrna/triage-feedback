<script setup lang="ts">
import { ref, watch } from "vue";
import { api } from "../services/api";
import { formatAge, formatDateTime, PENDING_LABEL, SOURCE_LABEL, TRISTATE_LABEL, VERDICT_LABEL } from "../assets/labels";
import { useVocab } from "../services/vocab";
import type { StoredCase, TriState } from "../interfaces/types";
import ColorChip from "../components/ColorChip.vue";
import RuleExplanation from "../components/RuleExplanation.vue";

const { complaintLabel, discriminatorLabel, vitalLabel, vitalUnit } = useVocab();

const props = defineProps<{ id: number }>();
const c = ref<StoredCase | null>(null);
const error = ref("");

// Watch the id (not onMounted) so switching between case details reloads the record even though
// Vue reuses the same component instance.
watch(
  () => props.id,
  async (id) => {
    c.value = null;
    error.value = "";
    try {
      c.value = await api.adminGet(id);
    } catch (e) {
      error.value = (e as Error).message;
    }
  },
  { immediate: true },
);

function vitalsEntries(v: Record<string, number>): [string, number][] {
  return Object.entries(v);
}
function discEntries(d: Record<string, TriState>): [string, TriState][] {
  return Object.entries(d).filter(([, s]) => s !== "unknown");
}
</script>

<template>
  <p><RouterLink to="/admin/cases">← Admin · všetky prípady</RouterLink></p>
  <div v-if="error" class="banner banner-error">{{ error }}</div>

  <template v-if="c">
    <h1>Detail prípadu (admin)</h1>
    <p class="muted small">{{ c.id }} · {{ formatDateTime(c.created_at) }} · {{ SOURCE_LABEL[c.source] }}</p>

    <div class="card">
      <h3>Zadané údaje</h3>
      <p>
        <strong>Vek:</strong> {{ formatAge(c.entered.age.value, c.entered.age.unit) }} ·
        <strong>Dôvod:</strong> {{ complaintLabel(c.entered.complaint_category) }}
        <span v-if="c.entered.complaint_text"> — {{ c.entered.complaint_text }}</span>
      </p>
      <p v-if="c.entered.note"><strong>Záznam:</strong> {{ c.entered.note }}</p>
      <p v-if="vitalsEntries(c.entered.vitals).length">
        <strong>Vitálne (zadané):</strong>
        <span v-for="[k, v] in vitalsEntries(c.entered.vitals)" :key="k" class="kv">{{ vitalLabel(k) }}: {{ v }} {{ vitalUnit(k) }}</span>
      </p>
      <p v-if="discEntries(c.entered.discriminators).length">
        <strong>Nálezy (zadané):</strong>
        <span v-for="[k, s] in discEntries(c.entered.discriminators)" :key="k" class="kv">{{ discriminatorLabel(k) }}: {{ TRISTATE_LABEL[s] }}</span>
      </p>
    </div>

    <div class="card">
      <h3>Rozhodnutie systému</h3>
      <RuleExplanation :decision="c.decision" />
    </div>

    <div class="card">
      <h3>Hodnotenie lekára</h3>
      <p v-if="c.verdict === null" class="muted">{{ PENDING_LABEL }}</p>
      <template v-else>
        <p>
          <strong>{{ c.verdict.agrees ? VERDICT_LABEL.agree : VERDICT_LABEL.disagree }}</strong> s rozhodnutím systému
        </p>
        <p v-if="c.verdict.comment"><strong>Komentár:</strong> {{ c.verdict.comment }}</p>
      </template>
    </div>

    <details class="card" open>
      <summary><strong>Tiché dáta pre analýzu</strong> (lekár ich pri hodnotení nevidel)</summary>

      <h4>Druhý názor modelu</h4>
      <p v-if="c.second_opinion">
        <ColorChip :color="c.second_opinion.color" /> ·
        {{ c.second_opinion.model_id }} / {{ c.second_opinion.prompt_version }}
      </p>
      <p v-else class="muted">—</p>

      <h4>Čo systém prečítal (extrakcia)</h4>
      <template v-if="c.extraction">
        <p class="muted small">
          ok: {{ c.extraction.ok }} · {{ c.extraction.model_id }} / {{ c.extraction.prompt_version }}
        </p>
        <p v-if="vitalsEntries(c.extraction.vitals).length">
          Vitálne: <span v-for="[k, v] in vitalsEntries(c.extraction.vitals)" :key="k" class="kv">{{ vitalLabel(k) }}: {{ v }} {{ vitalUnit(k) }}</span>
        </p>
        <p v-if="discEntries(c.extraction.discriminators).length">
          Nálezy: <span v-for="[k, s] in discEntries(c.extraction.discriminators)" :key="k" class="kv">{{ discriminatorLabel(k) }}: {{ TRISTATE_LABEL[s] }}</span>
        </p>
      </template>
      <p v-else class="muted">Bez extrakcie.</p>

      <h4>Pôvod (provenance)</h4>
      <p class="muted small">
        pravidlá {{ c.provenance.rule_set_version }} ·
        extraktor {{ c.provenance.extractor_model_id ?? "—" }} / {{ c.provenance.extractor_prompt_version ?? "—" }} ·
        druhý názor {{ c.provenance.second_opinion_model_id ?? "—" }} / {{ c.provenance.second_opinion_prompt_version ?? "—" }}
      </p>
    </details>
  </template>
</template>
