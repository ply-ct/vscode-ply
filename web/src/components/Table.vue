<template>
  <div>
    <div class="flowbee-config-tab-content" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import * as flowbee from 'flowbee';
import { decorator } from '../util/decorate';

export default defineComponent({
  name: 'Table',
  props: {
    value: {
      type: Object,
      required: true
    },
    readonly: {
      type: Boolean,
      default: false
    },
    singleLine: {
      type: Boolean,
      default: false
    }
  },
  emits: ['updateValue'],
  watch: {
    value() {
      this.initTable();
    }
  },
  mounted: function () {
    this.$nextTick(function () {
      this.initTable();
    });
    window.addEventListener('message', this.handleMessage);
  },
  unmounted: function () {
    window.removeEventListener('message', this.handleMessage);
  },
  methods: {
    initTable() {
      const table = new flowbee.Table(
        [
          { type: 'text', label: 'Name' },
          { type: 'text', label: 'Value' }
        ],
        this.stringValue(this.value),
        { readonly: this.readonly, singleLine: this.singleLine }
      );

      table.addDecorator(decorator);

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
    handleMessage(event: MessageEvent) {
      if (event.data.type === 'theme-change') {
        this.syncTheme();
      }
    },
    syncTheme() {
      this.$el.className = `flowbee-configurator-${this.getTheme()} table-container`;
    },
    getTheme(): string {
      return document.body.className.endsWith('vscode-light') ? 'light' : 'dark';
    }
  }
});
</script>
