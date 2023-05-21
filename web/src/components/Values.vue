<template>
  <div class="flowbee-values" />
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import * as flowbee from 'flowbee';
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
      type: Object as PropType<flowbee.Request | flowbee.Flow>,
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
      popup: new flowbee.ValuesPopup()
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
    getUserValues(): flowbee.UserValues {
      const valuesAccess = new flowbee.ValuesAccess(
        this.values.objects,
        this.values.env,
        this.values.options,
        this.values.refVals
      );
      const values: flowbee.ExpressionValue[] = flowbee.expressions(this.item).map((expr) => {
        return {
          expression: expr
        };
      });

      return { values, overrides: {} };
    },
    getOptions(): flowbee.ValuesOptions {
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
