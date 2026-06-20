<script setup lang="ts">
import type { Color } from "../interfaces/types";
import { COLOR_LABEL } from "../assets/labels";

defineProps<{ color: Color }>();
</script>

<template>
  <span class="chip" :class="`chip-${color.toLowerCase()}`">{{ COLOR_LABEL[color] }}</span>
</template>
