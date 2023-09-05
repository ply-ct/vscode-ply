<template>
  <div>
    <div class="flowbee-config-tab-content" />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import * as flowbee from 'flowbee';
import { Values } from '../model/values';
import { Decorator } from '../util/decorate';
import { Options } from '../model/options';

export default defineComponent({
  name: 'Table',
  props: {
    value: {
      type: Object,
      required: true
    },
    options: {
      type: Object as PropType<Options>,
      required: true
    },
    singleLine: {
      type: Boolean,
      default: false
    },
    values: {
      type: Object as PropType<Values>,
      default: null
    }
  },
  emits: ['updateValue', 'openFile'],
  watch: {
    value() {
      this.initTable();
    },
    'options.theme'() {
      this.initTable();
    },
    values() {
      this.initTable();
    },
    'values.overrides'() {
      this.initTable();
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.initTable();
    });
  },
  methods: {
    initTable() {
      const table = new flowbee.Table(
        [
          { type: 'text', label: 'Name' },
          { type: 'text', label: 'Value' }
        ],
        this.stringValue(this.value),
        { readonly: this.options.readonly, singleLine: this.singleLine }
      );

      if (this.values) {
        const decorator = new Decorator(this.values);
        decorator.onHoverAction((action) => {
          if (action.name === 'openFile') {
            this.$emit('openFile', action.args!.path);
          }
        });
        table.setDecorator((text: string) =>
          decorator.decorate(text, { theme: this.options.theme, hover: true })
        );
      }

      this.syncTheme();
      this.$el.style.display = 'flex';
      const tabContentEl = this.$el.querySelector('.flowbee-config-tab-content') as HTMLDivElement;
      tabContentEl.style.padding = '10px 5px 0 0';
      table.tableElement.style.color = 'var(--vscode-editor-foreground)';
      table.tableElement.style.backgroundColor = 'var(--vscode-editor-background)';
      table.onTableUpdate((updateEvent) => {
        this.$emit('updateValue', this.fromString(updateEvent.value));
      });
      if (tabContentEl.firstChild) {
        // why is this needed
        tabContentEl.removeChild(tabContentEl.firstChild);
      }
      tabContentEl.appendChild(table.tableElement);
    },
    stringValue(obj: { [key: string]: any }) {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return '';
      } else {
        const rows = [];
        for (const key of keys) {
          rows.push([key, obj[key]]);
        }
        return JSON.stringify(rows);
      }
    },
    fromString(str: string) {
      const val: { [key: string]: any } = {};
      const rows = JSON.parse(str);
      for (const row of rows) {
        if (row[0]) {
          val[row[0]] = row[1];
        }
      }
      return val;
    },
    syncTheme() {
      this.$el.className = `flowbee-configurator-${this.options.theme} table-container`;
    }
  }
});
</script>
