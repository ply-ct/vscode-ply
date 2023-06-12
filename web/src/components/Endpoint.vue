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
          @keypress="onUrlKeyPress"
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
import { decorate } from 'flowbee';
import { Request } from '../model/request';
import { Values } from '../model/values';
import { Options } from '../model/options';
import { Decorator } from '../util/decorate';

export default defineComponent({
  name: 'Endpoint',
  props: {
    options: {
      type: Object as PropType<Options>,
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
  emits: ['updateRequest', 'submitRequest', 'openFile'],
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
  },

  methods: {
    decorate() {
      if (document.activeElement === this.urlInput) {
        // don't try to decorate while editing
        this.urlInput.addEventListener('blur', () => this.decorate(), { once: true });
        return;
      }

      this.urlInput.innerHTML = '';
      decorate(this.urlInput, this.request.url, [
        (text: string) => {
          const decorator = new Decorator(this.values);
          decorator.onHoverAction((action) => {
            if (action.name === 'openFile') {
              this.$emit('openFile', action.args!.path);
            }
          });
          const decs = decorator.decorate(
            text,
            document.body.className.endsWith('vscode-light') ? 'light' : 'dark'
          );
          decs.forEach((dec) => {
            if (dec.hover?.lines) {
              if (dec.hover.lines.length > 1) {
                let left = (dec.range.end - dec.range.start) * 7.5;
                dec.hover.location = {
                  top: '-32px',
                  left: `${left}px`
                };
                const iRect = this.urlInput.getBoundingClientRect();
                dec.onHover = (element: HTMLElement, tooltip: HTMLElement) => {
                  tooltip.style.visibility = 'hidden';
                  const eRect = element.getBoundingClientRect();
                  const ttRect = tooltip.getBoundingClientRect();
                  const roomOnRight = iRect.right - eRect.right;
                  if (ttRect.width > roomOnRight) {
                    tooltip.style.left = `${left - eRect.width - ttRect.width + 3}px`;
                  }
                  tooltip.style.visibility = 'visible';
                };
              }
            }
          });
          return decs;
        }
      ]);
    },
    onUrlKeyPress(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
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
