<template></template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import {
  ValuesPopup,
  UserValues,
  ExpressionValue,
  ValuesOptions,
  ValuesActionEvent
} from 'flowbee';
import {
  Values as ValuesAccess,
  ExpressionHolder,
  expressions,
  isExpression
} from '@ply-ct/ply-values';
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
      type: Object as PropType<ExpressionHolder>,
      required: true
    },
    open: {
      type: Boolean,
      default: false
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
  emits: ['updateValues', 'openFile', 'save', 'close'],
  data() {
    return {
      popup: null as ValuesPopup | null,
      userOverrides: this.overrides
    };
    // return {} as {
    //   valuesPopup?: monaco.editor.IStandaloneCodeEditor;
    //   resizeObserver?: ResizeObserver;
    //   valuesAccess?: ValuesAccess;
    // };
  },
  watch: {
    open() {
      if (this.open) {
        this.userOverrides = this.values.overrides;
        this.openPopup();
        this.popup!.setDecorator((text: string) => {
          if (text && isExpression(text)) {
            return [
              { range: { line: 0, start: 0, end: text.length - 1 }, className: 'expression' }
            ];
          }
          return [];
        });
      } else {
        this.closePopup();
      }
    },
    values() {
      if (this.values.overrides) {
        this.userOverrides = this.values.overrides;
        this.popup?.setValues(this.getUserValues());
      }
    }
  },
  mounted() {
    window.addEventListener('message', this.handleMessage);
  },
  unmounted() {
    window.removeEventListener('message', this.handleMessage);
  },
  methods: {
    isOpen() {
      return this.popup?.isOpen;
    },
    openPopup() {
      this.syncTheme();

      if (!this.popup) {
        const split = document.getElementById('split') as HTMLDivElement;
        this.popup = new ValuesPopup(split, this.iconBase);
        this.popup.onValuesAction((actionEvent) => this.onValuesAction(actionEvent));
        this.popup.onOpenValues((openValuesEvent) => this.$emit('openFile', openValuesEvent.path));
      }
      this.popup.render(this.getUserValues(), this.getOptions());
    },
    closePopup() {
      this.popup?.close();
    },
    getUserValues(): UserValues {
      const valuesAccess = new ValuesAccess(this.values.valuesHolders, {
        ...this.values.evalOptions,
        logger: console
      });
      const values: ExpressionValue[] = expressions(this.item).map((expr) => {
        const locatedValue = valuesAccess.getValue(expr);
        return {
          expression: expr,
          value: locatedValue?.value,
          location: locatedValue?.location?.path
        };
      });

      return { values, overrides: this.userOverrides };
    },
    getOptions(): ValuesOptions {
      return {
        title: this.title,
        theme: this.getTheme(),
        help: {
          link: 'https://ply-ct.org/ply/topics/values',
          title: 'Values help',
          icon: 'help.svg'
        },
        actions: [
          {
            name: 'save',
            label: 'Save'
          },
          {
            name: 'clear',
            label: 'Clear'
          },
          {
            name: 'close',
            label: 'Cancel'
          }
        ]
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
    },
    onValuesAction(valuesAction: ValuesActionEvent) {
      if (valuesAction.action === 'save') {
        this.userOverrides = this.popup?.getValues()?.overrides || {};
        // parse avoids: Failed to execute 'postMessage': [object Object] could not be cloned
        this.$emit('save', JSON.parse(JSON.stringify(this.userOverrides)));
        this.popup?.close();
        this.$emit('close');
      } else if (valuesAction.action === 'clear') {
        this.userOverrides = {};
        this.popup?.clear();
        this.$emit('save', {});
      } else if (valuesAction.action === 'close') {
        this.$emit('close');
      }
    }
  }
});
</script>
