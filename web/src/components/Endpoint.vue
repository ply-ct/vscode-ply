<template>
  <div class="endpoint">
    <el-select v-model="request.method" @change="update('method', $event)">
      <el-option v-for="item in methods" :key="item.value" :value="item.value" />
    </el-select>
    <el-input v-model="request.url" class="endpoint-url" @input="update('url', $event)" />
    <button class="action-btn" type="button" @click="submit">Submit</button>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Request } from '../model/request';

export default defineComponent({
  name: 'Endpoint',
  props: {
    request: {
      type: Object as PropType<Request>,
      required: true
    }
  },
  emits: ['updateRequest', 'submitRequest'],
  data() {
    return {
      methods: [
        {
          value: 'GET'
        },
        {
          value: 'POST'
        },
        {
          value: 'PUT'
        },
        {
          value: 'PATCH'
        },
        {
          value: 'DELETE'
        }
      ]
    };
  },
  methods: {
    update(field: string, value: string) {
      this.$emit('updateRequest', { ...this.request, [field]: value });
    },
    submit() {
      this.$emit('submitRequest', this.request.name);
    }
  }
});
</script>
