<script setup lang="ts">
import type { Color } from "../types";
import { COLOR_LABEL } from "../labels";

defineProps<{ color: Color }>();
</script>

<template>
  <span class="chip" :class="`chip-${color.toLowerCase()}`">{{ COLOR_LABEL[color] }}</span>
</template>
