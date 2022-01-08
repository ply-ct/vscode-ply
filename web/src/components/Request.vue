<template>
  <div class="request">
    <div>
      <a :name="request.name"></a>
      <div
        class="request-name"
        tabindex="0"
        contenteditable="true"
        @input="onRename"
        @keydown="onNameKeyDown"
        @blur="onNameBlur"
      >
        {{ request.name || 'x' }}
      </div>
      <actions :options="options" :request="request" @requestAction="onAction" />
    </div>
    <endpoint :request="request" @updateRequest="onUpdate" @submitRequest="onSubmit" />
    <el-tabs tab-position="top">
      <el-tab-pane label="Body">
        <editor
          resource="Request Body"
          :value="request.body || ''"
          :language="language"
          :options="bodyOptions"
          @updateSource="onUpdateBody"
          @updateMarkers="onUpdateMarkers"
        />
      </el-tab-pane>
      <el-tab-pane label="Headers">
        <table-comp :value="request.headers" @updateValue="onUpdateHeaders" />
      </el-tab-pane>
      <el-tab-pane label="Source">
        <editor
          resource="Request Source"
          :value="request.source"
          language="yaml"
          :options="options"
          @updateSource="onUpdateSource"
          @updateMarkers="onUpdateMarkers"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import Actions from './Actions.vue';
import Endpoint from './Endpoint.vue';
import Editor from './Editor.vue';
import TableComp from './Table.vue';
import { Request } from '../model/request';

export default defineComponent({
  name: 'Request',
  components: { Actions, Endpoint, Editor, TableComp },
  props: {
    request: {
      type: Object as PropType<Request>,
      required: true
    },
    options: {
      type: Object,
      required: true
    }
  },
  emits: ['renameRequest', 'updateRequest', 'updateSource', 'updateMarkers', 'requestAction'],
  data() {
    return {
      language: 'json',
      theme: document.body.className.endsWith('vscode-dark') ? 'vs-dark' : 'vs',
      rename: this.request.name
    };
  },
  computed: {
    bodyOptions() {
      return {
        ...this.options,
        lineNumbers:
          this.options.lineNumbers &&
          this.request.method !== 'get' &&
          this.request.method !== 'delete'
      };
    }
  },
  methods: {
    onRename(event: Event) {
      this.rename = (event.target as HTMLElement).innerText.trim();
    },
    onNameKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' || event.key === 'Escape') {
        (event.target as HTMLElement).blur();
      }
    },
    onNameBlur() {
      if (this.rename !== this.request.name) {
        this.$emit('updateRequest', { ...this.request, name: this.rename });
      }
    },
    onUpdate(updatedRequest: Request) {
      this.$emit('updateRequest', updatedRequest);
    },
    onUpdateBody(content: string) {
      const request = { ...this.request };
      if (content.trim().length > 0) {
        request.body = content;
      } else {
        delete request.body;
      }
      this.$emit('updateRequest', request);
    },
    onUpdateHeaders(updatedHeaders: { [key: string]: string }) {
      this.$emit('updateRequest', { ...this.request, headers: updatedHeaders });
    },
    onUpdateSource(content: string) {
      this.$emit('updateSource', content);
    },
    onUpdateMarkers(resource: string, markers: any) {
      this.$emit('updateMarkers', resource, markers);
    },
    onSubmit(requestName: string) {
      this.onAction('submit', requestName);
    },
    onAction(action: string, requestName: string) {
      this.$emit('requestAction', action, requestName);
    }
  }
});
</script>