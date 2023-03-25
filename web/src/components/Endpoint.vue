<template>
  <div class="endpoint">
    <el-select
      v-model="request.method"
      :disabled="options.readonly"
      @change="update('method', $event)"
    >
      <el-option v-for="item in methods" :key="item.value" :value="item.value" />
    </el-select>
    <div class="el-input endpoint-url">
      <div class="el-input__wrapper">
        <div
          class="el-input__inner"
          :contenteditable="contentEditable"
          title="Request URL"
          spellcheck="false"
          @input="update('url', $event)"
        >
          {{ request.url }}
        </div>
      </div>
    </div>
    <button v-if="options.runnable" class="action-btn" type="button" @click="submit">Submit</button>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Request } from '../model/request';

export default defineComponent({
  name: 'Endpoint',
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
  computed: {
    contentEditable() {
      return this.options.readonly ? 'false' : ('plaintext-only' as any);
    }
  },
  methods: {
    update(field: string, valueOrEvent: string | Event) {
      let value = valueOrEvent;
      if (typeof value !== 'string') {
        value = (valueOrEvent as any).currentTarget?.innerText || '';
      }
      this.$emit('updateRequest', { ...this.request, [field]: value });
    },
    submit() {
      this.$emit('submitRequest', this.request.name);
    }
  }
});
</script>
