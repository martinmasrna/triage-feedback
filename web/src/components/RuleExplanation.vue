<script setup lang="ts">
import type { Decision } from "../types";
import ColorChip from "./ColorChip.vue";

defineProps<{ decision: Decision; hideHead?: boolean }>();
</script>

<template>
  <div class="explanation">
    <div v-if="!hideHead" class="explanation-head">
      <span>Výsledok systému:</span>
      <ColorChip :color="decision.color" />
    </div>

    <p v-if="!decision.decisive" class="muted">
      Žiadne pravidlo sa neaktivovalo — predvolená farba.
    </p>

    <ul v-else class="fired-list">
      <li class="decisive">
        <span>{{ decision.decisive.label_sk }}</span>
      </li>
    </ul>
  </div>
</template>
