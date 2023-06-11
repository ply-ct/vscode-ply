<template>
  <div class="response">
    <a :name="name"></a>
    <div class="response-spacer"></div>
    <div v-if="!response.loading" class="response-info">
      <el-tag v-if="response.status.code > 0" class="status" :type="statusType">
        <a :href="statusLink">
          {{ statusText }}
        </a>
      </el-tag>
      <span class="response-info-item">
        {{ responseTime }}
      </span>
      <span class="response-info-item">
        {{ responseSize }}
      </span>
      <span class="response-further">
        <div>{{ requestDt }}</div>
        <el-button v-if="response.body" type="primary" link size="small" @click="onSave"
          >Save</el-button
        >
      </span>
    </div>
    <div v-if="response.loading" class="response-loading">
      <span class="response-info-item"> Sending... </span>
      <button class="action-btn cancel-btn" type="button" @click="cancel">Cancel Request</button>
    </div>
    <el-tabs v-loading="response.loading" tab-position="top">
      <el-tab-pane v-if="response.status.code !== 0" label="Body">
        <editor
          resource="Response Body"
          :value="response.body || ''"
          :language="bodyLanguage"
          :readonly="true"
          :options="bodyOptions"
          @update-markers="onUpdateMarkers"
        />
      </el-tab-pane>
      <el-tab-pane v-if="response.status.code !== 0" label="Headers">
        <table-comp :value="response.headers" :readonly="true" />
      </el-tab-pane>
      <el-tab-pane v-if="response.status.code !== 0" label="Source">
        <editor
          resource="Response Source"
          :value="response.source || ''"
          :language="sourceLanguage"
          :readonly="true"
          :options="options"
          @update-markers="onUpdateMarkers"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { getReasonPhrase } from 'http-status-codes';
import { Response } from '../model/request';
import { Options } from '../model/options';
import { getLanguage } from '../util/content';
import Editor from './Editor.vue';
import TableComp from './Table.vue';

export default defineComponent({
  name: 'Response',
  components: { Editor, TableComp },
  props: {
    name: {
      type: String,
      required: true
    },
    response: {
      type: Object as PropType<Response>,
      required: true
    },
    options: {
      type: Object as PropType<Options>,
      required: true
    }
  },
  emits: ['updateMarkers', 'saveResponse', 'cancelRequest'],
  data() {
    return {
      theme: document.body.className.endsWith('vscode-dark') ? 'vs-dark' : 'vs'
    };
  },
  computed: {
    statusType() {
      if (this.response.status.code < 200) {
        return 'info';
      } else if (this.response.status.code < 300) {
        return 'success';
      } else if (this.response.status.code < 400) {
        return null;
      } else if (this.response.status.code < 500) {
        return 'warning';
      } else {
        return 'error';
      }
    },
    statusText() {
      return '' + this.response.status.code + ' ' + getReasonPhrase(this.response.status.code);
    },
    statusLink() {
      return `https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/${this.response.status.code}`;
    },
    responseTime() {
      if (typeof this.response.time === 'number') {
        return this.response.time + ' ms';
      }
      return null;
    },
    responseSize() {
      if (this.response.body) {
        const b = new Blob([this.response.body]).size;
        if (b > 1000) {
          return b / 1000 + ' KB';
        } else {
          return b + ' B';
        }
      }
      return null;
    },
    bodyLanguage() {
      return getLanguage(this.response);
    },
    sourceLanguage() {
      return this.response.source?.startsWith('{') ? 'json' : 'yaml';
    },
    requestDt() {
      if (this.response.submitted) {
        return new Date(this.response.submitted).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric'
        });
      }
      return null;
    },
    bodyOptions() {
      const lineNumbers: boolean = !!this.options.lineNumbers && !!this.response.body;
      return { ...this.options, lineNumbers };
    }
  },
  methods: {
    onUpdateMarkers(resource: string, markers: any) {
      this.$emit('updateMarkers', resource, markers);
    },
    onSave() {
      this.$emit('saveResponse', this.name);
    },
    cancel() {
      this.$emit('cancelRequest', this.name);
    }
  }
});
</script>
