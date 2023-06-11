<template>
  <div class="editor-container" />
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import * as monaco from 'monaco-editor';
import { Values as ValuesAccess } from '@ply-ct/ply-api';
import { Values } from '../model/values';
import { Options } from '../model/options';
import * as time from '../util/time';
import {
  initialize,
  getEditor,
  getExpressions,
  getDecorations,
  filterMarkers,
  expressionLanguages,
  registeredHoverLanguages
} from '../util/monaco';

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
      type: Object as PropType<Options>,
      required: true
    },
    values: {
      type: Object as PropType<Values>,
      default: null
    }
  },
  emits: ['updateSource', 'updateMarkers', 'openFile'],
  data() {
    return {} as {
      editor?: monaco.editor.IStandaloneCodeEditor;
      resizeObserver?: ResizeObserver;
      valuesAccess?: ValuesAccess;
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
      const model = this.editor?.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, newLanguage);
      }
    },
    values() {
      if (this.values) {
        this.valuesAccess = new ValuesAccess(this.values.valuesHolders, this.values.evalOptions);
      } else {
        this.valuesAccess = undefined;
      }
    }
  },
  mounted: function () {
    time.logtime('Monaco editor mounted');
    this.$nextTick(function () {
      this.initMonaco();
      this.resizeObserver = new ResizeObserver(() => {
        this.editor!.layout();
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

      let disposables: monaco.IDisposable[] = [];

      let expressions = getExpressions(this.editor.getModel());
      const decorations = this.editor.createDecorationsCollection(getDecorations(expressions));

      disposables.push(
        this.editor.onDidChangeModelContent(() => {
          const value = this.editor?.getValue();
          if (this.value !== value) {
            this.$emit('updateSource', value);
          }

          expressions = getExpressions(this.editor?.getModel());
          decorations.set(getDecorations(expressions));
        })
      );

      disposables.push(
        this.editor.onDidChangeModelDecorations(() => {
          const model = this.editor?.getModel();
          if (!model) return;

          const markers = monaco.editor.getModelMarkers({ resource: model.uri });
          const newMarkers = filterMarkers(model, markers);
          if (newMarkers.length !== markers.length) {
            monaco.editor.setModelMarkers(
              model,
              'json',
              newMarkers.filter((m) => m.owner === 'json')
            );
          }
          this.$emit('updateMarkers', this.resource, newMarkers);
        })
      );

      const language = this.editor.getModel()?.getLanguageId();
      if (
        language &&
        expressionLanguages.includes(language) &&
        !registeredHoverLanguages.includes(language)
      ) {
        registeredHoverLanguages.push(language);
        const commandId = this.editor.addCommand(0, (...args: any[]) => {
          this.$emit('openFile', args[1].path);
        });
        disposables.push(
          monaco.languages.registerHoverProvider(language, {
            provideHover: (_model, position) => {
              const expression = expressions.find(
                (expr) =>
                  expr.range.startLineNumber === position.lineNumber &&
                  expr.range.startColumn <= position.column &&
                  expr.range.endColumn >= position.column
              );
              if (expression && this.values) {
                const value = this.valuesAccess?.getValue(expression.text);
                if (value) {
                  const hover: monaco.languages.Hover = {
                    contents: [
                      {
                        supportHtml: true,
                        value: `Value: \`${value.value}\``
                      }
                    ]
                  };
                  if (value.location) {
                    const args = { path: value.location.path, expression: expression.text };
                    let label = args.path.replace(/\\/g, '/');
                    const lastSlash = label.lastIndexOf('/');
                    if (lastSlash >= 0 && lastSlash < label.length - 1) {
                      label = label.substring(lastSlash + 1);
                    }
                    hover.contents.push({
                      isTrusted: true,
                      value: `From: [${label}](command:${commandId}?${encodeURIComponent(
                        JSON.stringify(args)
                      )} "Open values file")`
                    });
                  }
                  return hover;
                } else {
                  return { contents: [{ value: 'Not found: `' + expression.text + '`' }] };
                }
              }
            }
          })
        );
      }

      this.editor.onDidDispose(() => {
        registeredHoverLanguages.splice(0, registeredHoverLanguages.length);
        disposables.forEach((d) => d.dispose());
        disposables = [];
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
