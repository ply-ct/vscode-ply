<template>
  <div class="actions">
    <icon :base="options.iconBase" file="run.svg" @click="onAction" />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import Icon from './Icon.vue';
import { Request } from '../model/request';

export default defineComponent({
  name: 'Actions',
  components: { Icon },
  props: {
    options: {
      type: Object,
      required: true
    },
    request: {
      type: Object as PropType<Request>,
      required: true
    }
  },
  emits: ['requestAction'],
  methods: {
    onAction(action: string) {
      this.$emit('requestAction', action, this.request.name);
    }
  }
});
</script>
