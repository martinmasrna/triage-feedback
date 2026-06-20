import { reactive, ref, computed } from "vue";
import { COLOR_ORDER } from "../assets/labels";
import { useVocab } from "../services/vocab";
import type { Color, DoctorCase } from "../interfaces/types";

export type SortKey = "time" | "age" | "complaint" | "source" | "color" | "verdict";

// Module-level singleton — persists across navigation within the SPA session.
const filter = reactive({
  dateFrom: "",
  dateTo: "",
  ageFromDays: null as number | null,
  ageToDays: null as number | null,
  complaint: "",
  source: "" as "" | "doctor" | "ai_generated",
  color: "" as "" | Color,
  verdict: "" as "" | "agree" | "disagree" | "pending",
});

const sortKey = ref<SortKey>("time");
const sortAsc = ref(false);

function ageInDays(c: DoctorCase): number {
  const { value, unit } = c.entered.age;
  return unit === "years" ? value * 365 : unit === "months" ? value * 30 : value;
}

function verdictRank(c: DoctorCase): number {
  if (c.verdict === null) return 0;
  return c.verdict.agrees ? 1 : 2;
}

export function useCaseListFilters() {
  const { complaintLabel } = useVocab();

  const anyFilterActive = computed(
    () =>
      filter.dateFrom !== "" ||
      filter.dateTo !== "" ||
      filter.ageFromDays !== null ||
      filter.ageToDays !== null ||
      filter.complaint !== "" ||
      filter.source !== "" ||
      filter.color !== "" ||
      filter.verdict !== "" ||
      sortKey.value !== "time" ||
      sortAsc.value,
  );

  function applyFiltersAndSort(cases: DoctorCase[]): DoctorCase[] {
    let list = cases;

    if (filter.dateFrom) {
      const from = new Date(filter.dateFrom).getTime();
      list = list.filter((c) => new Date(c.created_at).getTime() >= from);
    }
    if (filter.dateTo) {
      const to = new Date(filter.dateTo).getTime();
      list = list.filter((c) => new Date(c.created_at).getTime() <= to);
    }
    if (filter.ageFromDays !== null) list = list.filter((c) => ageInDays(c) >= filter.ageFromDays!);
    if (filter.ageToDays !== null) list = list.filter((c) => ageInDays(c) <= filter.ageToDays!);
    if (filter.complaint) list = list.filter((c) => c.entered.complaint_category === filter.complaint);
    if (filter.source) list = list.filter((c) => c.source === filter.source);
    if (filter.color) list = list.filter((c) => c.decision.color === filter.color);
    if (filter.verdict) {
      if (filter.verdict === "pending") list = list.filter((c) => c.verdict === null);
      else if (filter.verdict === "agree") list = list.filter((c) => c.verdict?.agrees === true);
      else list = list.filter((c) => c.verdict?.agrees === false);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey.value) {
        case "age":       cmp = ageInDays(a) - ageInDays(b); break;
        case "complaint": cmp = complaintLabel(a.entered.complaint_category).localeCompare(complaintLabel(b.entered.complaint_category), "sk"); break;
        case "source":    cmp = a.source.localeCompare(b.source); break;
        case "color":     cmp = COLOR_ORDER.indexOf(a.decision.color) - COLOR_ORDER.indexOf(b.decision.color); break;
        case "verdict":   cmp = verdictRank(a) - verdictRank(b); break;
        default:          cmp = a.created_at.localeCompare(b.created_at); break;
      }
      return sortAsc.value ? cmp : -cmp;
    });
    return sorted;
  }

  return { filter, sortKey, sortAsc, anyFilterActive, applyFiltersAndSort };
}
