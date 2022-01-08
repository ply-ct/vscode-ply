<template>
  <div class="endpoint">
    <el-select v-model="method" @change="update('method', $event)">
      <el-option
        v-for="item in methods"
        :key="item.value"
        :label="item.label"
        :value="item.value"
      />
    </el-select>
    <el-input v-model="url" class="endpoint-url" @input="update('url', $event)" />
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
          value: 'get',
          label: 'GET'
        },
        {
          value: 'post',
          label: 'POST'
        },
        {
          value: 'put',
          label: 'PUT'
        },
        {
          value: 'patch',
          label: 'PATCH'
        },
        {
          value: 'delete',
          label: 'DELETE'
        }
      ],
      method: this.request.method,
      url: this.request.url
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
