<template>
  <div class="actions">
    <div v-if="options.runnable">
      <icon :base="options.iconBase" file="run.svg" title="Run Test" @click="onAction" />
      <icon :base="options.iconBase" file="values.svg" title="Request Values" @click="onAction" />
      <icon
        :base="options.iconBase"
        file="expected.svg"
        title="Expected Results"
        @click="onAction"
      />
      <icon :base="options.iconBase" file="compare.svg" title="Compare Results" @click="onAction" />
      <auth
        :iconBase="options.iconBase"
        :auth-header="request.headers.Authorization"
        @auth-change="onAction"
      />
      <icon
        :base="options.iconBase"
        file="help.svg"
        title="Help"
        url="https://ply-ct.org/ply/topics/requests"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Request } from '../model/request';
import { Options } from '../model/options';
import Icon from './Icon.vue';
import Auth from './Auth.vue';

export default defineComponent({
  name: 'Actions',
  components: { Icon, Auth },
  props: {
    options: {
      type: Object as PropType<Options>,
      required: true
    },
    request: {
      type: Object as PropType<Request>,
      required: true
    }
  },
  emits: ['requestAction'],
  methods: {
    onAction(action: string, value?: string) {
      this.$emit('requestAction', action, this.request.name, value);
    }
  }
});
</script>
