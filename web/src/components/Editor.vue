<template>
  <div class="editor-container" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import * as monaco from 'monaco-editor';
import * as time from '../util/time';
import { initialize, getEditor } from '../util/monaco.js';

initialize();

export default defineComponent({
  name: 'Editor',
  props: {
    resource: {
      type: String,
      required: true
    },
    language: {
      type: String,
      required: true
    },
    value: {
      type: String,
      required: true
    },
    readonly: {
      type: Boolean,
      default: false
    },
    options: {
      type: Object,
      required: true
    }
  },
  emits: ['updateSource', 'updateMarkers'],
  data() {
    return {} as any as {
      editor: any;
      resizeObserver?: ResizeObserver;
    };
  },
  watch: {
    value(newValue) {
      if (this.editor) {
        if (newValue !== this.editor.getValue()) {
          this.editor.setValue(newValue);
        }
      }
    },
    readonly(newReadonly) {
      if (this.editor) {
        this.editor.updateOptions({ ...this.editor.getOptions(), readOnly: newReadonly });
      }
    },
    language(newLanguage) {
      monaco.editor.setModelLanguage(this.editor.getModel(), newLanguage);
    }
  },
  mounted: function () {
    time.logtime('Monaco editor mounted');
    this.$nextTick(function () {
      this.initMonaco();
      this.resizeObserver = new ResizeObserver(() => {
        this.editor.layout();
      });
      this.resizeObserver.observe(this.$el);
    });
    window.addEventListener('message', this.handleMessage);
  },
  unmounted: function () {
    if (this.resizeObserver) {
      this.resizeObserver.unobserve(this.$el);
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }
    window.removeEventListener('message', this.handleMessage);
  },
  methods: {
    initMonaco() {
      this.editor = getEditor(this.$el, this.value, this.language, this.readonly, this.options);
      time.logtime('Monaco created');

      if (!this.readonly) {
        this.editor.onDidChangeModelContent(() => {
          const value = this.editor.getValue();
          if (this.value !== value) {
            this.$emit('updateSource', value);
          }
        });
      }
      this.editor.onDidChangeModelDecorations(() => {
        const model = this.editor.getModel();
        if (model === null) return;
        const markers = monaco.editor.getModelMarkers({ resource: model.uri });
        this.$emit('updateMarkers', this.resource, markers);
      });
    },
    handleMessage(event: MessageEvent) {
      if (event.data.type === 'theme-change') {
        this.syncTheme();
      }
    },
    syncTheme() {
      const theme = document.body.className.endsWith('vscode-dark') ? 'vs-dark' : 'vs';
      if (this.editor) {
        monaco.editor.setTheme(theme);
      }
    }
  }
});
</script>
