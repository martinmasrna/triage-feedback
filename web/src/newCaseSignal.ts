import { ref } from "vue";

// Bumped when the "Nový prípad" nav link is clicked while already on that
// route (so the router won't trigger a fresh mount). NewCaseView watches
// this to reset its in-progress wizard state.
export const newCaseSignal = ref(0);

export function requestNewCase() {
  newCaseSignal.value++;
}
