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
      :values="values"
      @update-request="onUpdate"
      @submit-request="onSubmit"
      @open-file="onOpenFile"
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
          :values="values"
          @update-source="onUpdateBody"
          @update-markers="onUpdateMarkers"
          @open-file="onOpenFile"
        />
        <div v-if="isFormUrlEncoded" class="form-data">
          <table-comp
            :value="formParams"
            :options="options"
            :values="values"
            @update-value="onUpdateFormParams"
            @open-file="onOpenFile"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="Headers">
        <table-comp
          :value="request.headers"
          :options="options"
          :values="values"
          @update-value="onUpdateHeaders"
          @open-file="onOpenFile"
        />
      </el-tab-pane>
      <el-tab-pane label="Query">
        <table-comp
          :value="queryParams"
          :options="options"
          :single-line="true"
          :values="values"
          @update-value="onUpdateQuery"
          @open-file="onOpenFile"
        />
      </el-tab-pane>
      <el-tab-pane label="Auth">
        <auth :auth-header="request.headers.Authorization" @auth-change="onUpdateAuth" />
      </el-tab-pane>
      <el-tab-pane label="Source">
        <editor
          resource="Request Source"
          :value="request.source"
          language="yaml"
          :options="options"
          :readonly="options.readonly"
          :values="values"
          @update-source="onUpdateSource"
          @update-markers="onUpdateMarkers"
          @open-file="onOpenFile"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
  <vals
    title="Request Values"
    :theme="options.theme"
    :icon-base="options.iconBase"
    :item="request"
    :open="valuesOpen"
    :values="values"
    @open-file="onOpenFile"
    @save="onSaveValues"
    @close="onCloseValues"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Request, Result } from '../model/request';
import { Values } from '../model/values';
import { Options } from '../model/options';
import { getContentType, getLanguage } from '../util/content';
import Actions from './Actions.vue';
import Endpoint from './Endpoint.vue';
import Editor from './Editor.vue';
import TableComp from './Table.vue';
import Auth from './Auth.vue';
import Vals from './Values.vue';
export default defineComponent({
  name: 'Request',
  components: { Actions, Endpoint, Editor, TableComp, Auth, Vals },
  props: {
    request: {
      type: Object as PropType<Request>,
      required: true
    },
    options: {
      type: Object as PropType<Options>,
      required: true
    },
    file: {
      type: String,
      default: ''
    },
    result: {
      type: Object as PropType<Result>,
      default: null
    },
    values: {
      type: Object as PropType<Values>,
      required: true
    }
  },
  emits: [
    'renameRequest',
    'updateRequest',
    'updateSource',
    'updateMarkers',
    'openFile',
    'requestAction',
    'saveValues'
  ],
  data() {
    return {
      theme: document.body.className.endsWith('vscode-dark') ? 'vs-dark' : 'vs',
      rename: this.request.name,
      valuesOpen: false
    };
  },
  computed: {
    canHaveBody() {
      return this.request.method !== 'GET'; // && this.request.method !== 'DELETE';
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
      return getContentType(this.request)?.toLowerCase() === 'application/x-www-form-urlencoded';
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
    },
    queryParams() {
      const params: { [key: string]: string } = {};
      const q = this.request.url.indexOf('?');
      if (q > 0 && q < this.request.url.length - 1) {
        for (const seg of this.request.url.substring(q + 1).split('&')) {
          const eq = seg.indexOf('=');
          let name: string;
          let val = '';
          if (eq > 0 && eq < seg.length) {
            name = seg.substring(0, eq);
            val = eq < seg.length - 1 ? seg.substring(eq + 1) : '';
          } else {
            name = seg;
          }
          params[name] = val;
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
          request.body += this.specialUriEncode(keys[i]) + '=' + this.specialUriEncode(val);
        }
      } else {
        delete request.body;
      }
      this.$emit('updateRequest', request);
    },
    specialUriEncode(str: string): string {
      // exclude expressions
      return encodeURIComponent(str).replace(
        /%24%7B.+?%7D/g,
        (s) => '${' + s.substring(6, s.length - 3) + '}'
      );
    },
    onUpdateHeaders(updatedHeaders: { [key: string]: string }) {
      this.$emit('updateRequest', { ...this.request, headers: updatedHeaders });
    },
    onUpdateQuery(updatedParams: { [key: string]: string }) {
      let query = '?';
      for (const [i, name] of Object.keys(updatedParams).entries()) {
        if (i > 0) query += '&';
        query += name;
        const value = updatedParams[name];
        if (value) query += `=${value}`;
      }
      let url: string;
      const q = this.request.url.indexOf('?');
      if (q > 0) url = this.request.url.substring(0, q) + query;
      else url = `${this.request.url}${query}`;
      this.$emit('updateRequest', { ...this.request, url });
    },
    onUpdateAuth(authHeader: string) {
      const headers: { [key: string]: string } = {
        ...this.request.headers,
        Authorization: authHeader
      };
      if (!headers.Authorization) {
        delete headers.Authorization;
      }
      this.$emit('updateRequest', { ...this.request, headers });
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
    onOpenFile(file: string) {
      if (file === '<Override>') {
        this.valuesOpen = true;
      } else {
        this.$emit('openFile', file);
      }
    },
    onSaveValues(overrides: { [expr: string]: string }) {
      this.$emit('saveValues', overrides);
    },
    onCloseValues() {
      this.valuesOpen = false;
    },
    onAction(action: string, requestName: string) {
      if (action === 'values') {
        this.valuesOpen = !this.valuesOpen;
      } else if (action === 'auth') {
      } else {
        this.$emit('requestAction', action, requestName);
      }
    }
  }
});
</script>
