<template>
  <img class="icon" :src="src" :alt="alt" @click="onClick" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Icon',
  props: {
    base: {
      type: String,
      required: true
    },
    file: {
      type: String,
      required: true
    }
  },
  emits: ['click'],
  computed: {
    src() {
      return `${this.base}/${this.file}`;
    },
    alt() {
      return this.file.substring(0, this.file.lastIndexOf('.'));
    },
    style() {
      const cursor = this.$attrs?.click ? 'pointer' : 'default';
      return `cursor:${cursor}`;
    }
  },
  methods: {
    onClick() {
      this.$emit('click', this.alt);
    }
  }
});
</script>
