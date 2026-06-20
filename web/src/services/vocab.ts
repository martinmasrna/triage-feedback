// Shared, cached lookup of the server vocabulary (complaint categories, discriminators, vitals)
// so views can render Slovak `label_sk` instead of raw keys. Form-options is fetched once and
// shared across components; every helper falls back to the raw key if options aren't loaded yet
// or the key is unknown, so rendering never blocks on the fetch.
import { computed } from "vue";
import { ref } from "vue";
import { api } from "./api";
import type { FormOptions } from "../interfaces/types";

const options = ref<FormOptions | null>(null);
let started = false;

function ensureLoaded(): void {
  if (started) return;
  started = true;
  api
    .formOptions()
    .then((o) => {
      options.value = o;
    })
    .catch(() => {
      started = false; // allow a retry on the next mount
    });
}

function indexByKey(items: { key: string; label_sk: string }[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.key, i.label_sk]));
}

export function useVocab() {
  ensureLoaded();

  const complaint = computed(() => indexByKey(options.value?.complaint_categories ?? []));
  const discriminator = computed(() => indexByKey(options.value?.discriminators ?? []));
  const vitalLabels = computed(() => indexByKey(options.value?.vitals ?? []));
  const vitalUnits = computed(() =>
    Object.fromEntries((options.value?.vitals ?? []).map((v) => [v.key, v.unit])),
  );

  return {
    complaintLabel: (key: string) => complaint.value[key] ?? key,
    discriminatorLabel: (key: string) => discriminator.value[key] ?? key,
    vitalLabel: (key: string) => vitalLabels.value[key] ?? key,
    vitalUnit: (key: string) => vitalUnits.value[key] ?? "",
  };
}
