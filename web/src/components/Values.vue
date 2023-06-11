<template>
  <div class="flowbee-values" />
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { ValuesPopup, UserValues, ExpressionValue, ValuesOptions } from 'flowbee';
import { PlyRequest, Flow, Values as ValuesAccess, expressions } from '@ply-ct/ply-api';
import { Decorator } from '../util/decorate';
import { Values } from '../model/values';

export default defineComponent({
  name: 'Values',
  props: {
    title: {
      type: String,
      default: 'Values'
    },
    iconBase: {
      type: String,
      required: true
    },
    item: {
      type: Object as PropType<PlyRequest | Flow>,
      required: true
    },
    values: {
      type: Object as PropType<Values>,
      default: { env: {}, objects: {} }
    },
    overrides: {
      type: Object as PropType<{ [expr: string]: string }>,
      default: {}
    }
  },
  emits: ['updateValues', 'openFile'],
  data() {
    // TODO resizeObserver (see Editor)
    return {
      popup: new ValuesPopup()
    };
    // return {} as {
    //   valuesPopup?: monaco.editor.IStandaloneCodeEditor;
    //   resizeObserver?: ResizeObserver;
    //   valuesAccess?: ValuesAccess;
    // };
  },
  watch: {
    values() {
      this.updatePopup();
    }
  },
  mounted: function () {
    this.$nextTick(function () {
      this.updatePopup();
    });
    window.addEventListener('message', this.handleMessage);
  },
  unmounted: function () {
    window.removeEventListener('message', this.handleMessage);
  },
  methods: {
    updatePopup() {
      this.syncTheme();
      this.popup.render(this.getUserValues(), this.getOptions());
    },
    getUserValues(): UserValues {
      const valuesAccess = new ValuesAccess(this.values.valuesHolders, this.values.evalOptions);
      const values: ExpressionValue[] = expressions(this.item).map((expr) => {
        return {
          expression: expr
        };
      });

      return { values, overrides: {} };
    },
    getOptions(): ValuesOptions {
      return {
        title: this.title,
        theme: this.getTheme(),
        iconBase: this.iconBase,
        help: {
          link: 'https://ply-ct.org/ply/topics/values',
          title: 'Values help',
          icon: 'help.svg'
        }
      };
    },
    handleMessage(event: MessageEvent) {
      if (event.data.type === 'theme-change') {
        this.syncTheme();
      }
    },
    syncTheme() {
      this.$el.className = `flowbee-values-${this.getTheme()}`;
    },
    getTheme(): 'light' | 'dark' {
      return document.body.className.endsWith('vscode-light') ? 'light' : 'dark';
    }
  }
});
</script>
