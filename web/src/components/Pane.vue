<template>
  <div :class="{ pane: true, 'pane-left': !isRight, 'pane-right': isRight }">
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Pane',
  props: {
    isRight: {
      type: Boolean,
      default: false
    }
  }
});
</script>
