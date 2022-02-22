<template>
  <div class="request">
    <div class="request-line">
      <img
        v-if="result?.state && result.state !== 'skipped'"
        class="status-icon"
        :src="statusIcon"
        :alt="result?.state"
        :title="result?.message"
      />
      <a :name="request.name"></a>
      <div
        class="request-name"
        tabindex="0"
        :contenteditable="!options.readonly"
        @input="onRename"
        @keydown="onNameKeyDown"
        @blur="onNameBlur"
      >
        {{ request.name || 'Request-1' }}
      </div>
      <a v-if="file" class="file-link" href="" @click="onAction('open-file', request.name)">{{
        file
      }}</a>
      <actions :options="options" :request="request" @requestAction="onAction" />
    </div>
    <endpoint
      :options="options"
      :request="request"
      @updateRequest="onUpdate"
      @submitRequest="onSubmit"
    />
    <el-tabs tab-position="top">
      <el-tab-pane label="Body">
        <editor
          v-if="!isFormUrlEncoded"
          resource="Request Body"
          :value="request.body || ''"
          :language="bodyLanguage"
          :options="bodyOptions"
          :readonly="options.readonly || !canHaveBody"
          @updateSource="onUpdateBody"
          @updateMarkers="onUpdateMarkers"
        />
        <div v-if="isFormUrlEncoded" class="form-data">
          <table-comp
            :value="formParams"
            :readonly="options.readonly"
            @updateValue="onUpdateFormParams"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="Headers">
        <table-comp
          :value="request.headers"
          :readonly="options.readonly"
          @updateValue="onUpdateHeaders"
        />
      </el-tab-pane>
      <el-tab-pane label="Source">
        <editor
          resource="Request Source"
          :value="request.source"
          language="yaml"
          :options="options"
          :readonly="options.readonly"
          @updateSource="onUpdateSource"
          @updateMarkers="onUpdateMarkers"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Request, Result } from '../model/request';
import { getContentType, getLanguage } from '../util/content';
import Actions from './Actions.vue';
import Endpoint from './Endpoint.vue';
import Editor from './Editor.vue';
import TableComp from './Table.vue';

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
    },
    file: {
      type: String,
      default: ''
    },
    result: {
      type: Object as PropType<Result>,
      default: null
    }
  },
  emits: ['renameRequest', 'updateRequest', 'updateSource', 'updateMarkers', 'requestAction'],
  data() {
    return {
      theme: document.body.className.endsWith('vscode-dark') ? 'vs-dark' : 'vs',
      rename: this.request.name
    };
  },
  computed: {
    canHaveBody() {
      return this.request.method !== 'GET' && this.request.method !== 'DELETE';
    },
    bodyLanguage() {
      return getLanguage(this.request, 'json');
    },
    bodyOptions() {
      return {
        ...this.options,
        lineNumbers: this.options.lineNumbers && this.canHaveBody
      };
    },
    statusIcon() {
      if (this.result?.state) {
        return `${this.options.iconBase}/${this.result.state}.svg`;
      }
    },
    isFormUrlEncoded() {
      if (
        this.request.method === 'GET' ||
        this.request.method === 'DELETE' ||
        !this.request.headers
      ) {
        return false;
      }
      return getContentType(this.request);
    },
    formParams() {
      const params: { [key: string]: string } = {};
      if (this.request.body) {
        for (const seg of this.request.body.split('&')) {
          const eq = seg.indexOf('=');
          if (eq > 0 && eq < seg.length) {
            const name = seg.substring(0, eq);
            const val = eq < seg.length - 1 ? seg.substring(eq + 1) : '';
            params[decodeURIComponent(name)] = decodeURIComponent(val);
          }
        }
      }
      return params;
    }
  },
  methods: {
    onRename(event: Event) {
      this.rename = (event.target as HTMLElement).innerText.trim();
    },
    onNameKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' || event.key === 'Escape') {
        (event.target as HTMLElement).blur();
      } else if (
        event.key === ':' ||
        event.key === '#' ||
        event.key === "'" ||
        event.key === '"' ||
        event.key === '.' ||
        event.key === ';' ||
        event.key === '@' ||
        event.key === ',' ||
        event.key === '$' ||
        event.key === '%' ||
        event.key === '~' ||
        event.key === '^' ||
        event.key === '?' ||
        event.key === '{' ||
        event.key === '}' ||
        event.key === '\\' ||
        event.key === '/'
      ) {
        event.preventDefault();
      }
    },
    onNameBlur() {
      if (this.rename !== this.request.name) {
        this.$emit('updateRequest', { ...this.request, name: this.rename });
      }
    },
    onUpdate(updatedRequest: Request) {
      const request = { ...updatedRequest };
      if (request.method === 'GET' || request.method === 'DELETE') {
        delete request.body;
      }
      this.$emit('updateRequest', request);
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
    onUpdateFormParams(updatedParams: { [key: string]: string }) {
      const request = { ...this.request };
      const keys = Object.keys(updatedParams);
      if (keys) {
        request.body = '';
        for (let i = 0; i < keys.length; i++) {
          if (i > 0) request.body += '&';
          const val = updatedParams[keys[i]];
          request.body += encodeURIComponent(keys[i]) + '=' + encodeURIComponent(val);
        }
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
