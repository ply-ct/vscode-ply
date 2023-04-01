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
          ref="urlInput"
          class="el-input__inner url-input"
          :contenteditable="contentEditable"
          spellcheck="false"
          @input="update('url', $event)"
          @focus="urlInput.style.overflowX = 'hidden'"
          @blur="urlInput.style.overflowX = ''"
        ></div>
      </div>
    </div>
    <button v-if="options.runnable" class="action-btn" type="button" @click="submit">Submit</button>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { decorate, Decoration, undecorate } from 'flowbee';
import { Request } from '../model/request';
import { Decorator } from '../util/decorate';
import { Hover } from 'vscode';
import { Values } from '../model/values';

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
    },
    values: {
      type: Object as PropType<Values>,
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
    },
    urlInput(): HTMLDivElement {
      return this.$refs.urlInput as HTMLDivElement;
    }
  },
  watch: {
    values() {
      this.decorate();
    }
  },
  mounted: function () {
    this.decorate();
    // const urlDiv = this.$refs.urlInput as HTMLDivElement;
    // let rect: DOMRect | null = null;
    // let x = -1;
    // urlDiv.onmouseover = (ev: MouseEvent) => {
    //   let rect = (ev.currentTarget as any).getBoundingClientRect();
    //   x = ev.clientX - rect.left;
    //   // urlDiv.parentElement!.parentElement!.style.overflowX = '';
    // };
    // urlDiv.onmouseleave = () => {
    //   rect = null;
    //   x = -1;
    //   // urlDiv.parentElement!.parentElement!.style.overflowX = '';
    // };
  },

  methods: {
    onUrlFocus() {
      this.urlInput.style.overflowX = 'hidden';
    },
    decorate() {
      this.urlInput.innerHTML = '';
      decorate(this.urlInput, this.request.url, [
        (text: string) => {
          const decs = new Decorator(this.values).decorate(text);
          decs.forEach((dec) => {
            if (dec.hover?.lines) {
              if (dec.hover.lines.length > 1) {
                let left = (dec.range.end - dec.range.start) * 7.5;
                // if (rect && x >= 0) {
                //   const percent = x / rect.width;
                //   if (percent > 50) {
                //     left = -32;
                //   }
                // }
                // no room at the inn
                dec.hover.location = {
                  top: '-32px',
                  left: `${left}px`
                };
              }
            }
          });
          return decs;
        }
      ]);
    },
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
