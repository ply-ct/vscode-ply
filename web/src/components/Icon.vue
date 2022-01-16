<template>
  <img v-if="!url" class="icon" :src="src" :alt="alt" :title="title" @click="onClick" />
  <a v-if="url" :href="url">
    <img class="icon" :src="src" :alt="alt" :title="title" />
  </a>
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
    },
    title: {
      type: String,
      required: true
    },
    url: {
      type: String,
      default: ''
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
