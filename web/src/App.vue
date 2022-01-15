<template>
  <split v-if="request">
    <pane>
      <request
        :request="request"
        :options="options"
        @updateRequest="onUpdate"
        @updateSource="onUpdateSource"
        @updateMarkers="onUpdateMarkers"
        @requestAction="onAction"
      />
    </pane>
    <pane :is-right="true">
      <div v-if="message" class="error">{{ message }}</div>
      <response
        v-if="!message"
        :name="request.name"
        :response="response"
        :options="options"
        @updateMarkers="onUpdateMarkers"
        @cancelRequest="onCancel"
      />
    </pane>
  </split>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import * as yaml from './util/yaml';
import * as time from './util/time';
import Split from './components/Split.vue';
import Pane from './components/Pane.vue';
import Request from './components/Request.vue';
import Response from './components/Response.vue';
import { Request as Req, Response as Resp, DUMMY_URL } from './model/request';

// @ts-ignore
const vscode = acquireVsCodeApi();

export default defineComponent({
  name: 'App',
  components: { Split, Pane, Request, Response },
  data() {
    return {
      options: {},
      requestName: '', // original request name -- not changed here
      request: null,
      response: null,
      file: '',
      message: ''
    } as any as {
      options: any;
      requestName: string;
      request: Req;
      response: Resp;
      file: string;
      message: string;
    };
  },
  mounted: function () {
    time.logtime('App mounted()');
    this.$nextTick(function () {
      window.addEventListener('message', this.handleMessage);
      time.logtime('Webview sends: ready');
      vscode.postMessage({ type: 'ready' });
    });
  },
  unmounted: function () {
    window.removeEventListener('message', this.handleMessage);
  },
  methods: {
    blankResponse(): Resp {
      return {
        status: { code: 0, message: '' },
        headers: {},
        loading: false
      };
    },
    handleMessage(event: MessageEvent) {
      const message = event.data; // json message data from extension

      if (!message || !message.type) {
        return; // not interested
      }

      time.logtmsg(message.sent, `Editor sent: ${message.type}`);
      time.logtime(`Webview received: ${message.type}\n`);
      console.debug(`message: ${JSON.stringify(message, null, 2)}`);
      if (message.type === 'update') {
        this.setMessage('');
        this.file = message.file;
        this.requestName = message.name;
        if (message.options) {
          const theme = document.body.className.endsWith('vscode-dark') ? 'dark' : 'light';
          this.options = {
            ...message.options,
            iconBase: `${message.options.base}/img/icons/${theme}`,
            theme
          };
        }
        const isNew = !message.text;
        if (isNew) {
          this.requestName = message.file
            .split('/')
            .pop()
            .replace(/\.[^/.]+$/, '');
          this.request = {
            url: DUMMY_URL,
            name: this.requestName,
            method: 'GET',
            headers: {},
            source: ''
          };
          this.request.source = this.toYaml();
          this.update();
          this.$nextTick(function () {
            this.focusRequestName();
          });
        } else {
          const obj = yaml.load(message.file, message.text);
          this.requestName = Object.keys(obj)[0];
          this.request = {
            ...obj[this.requestName],
            name: this.requestName,
            source: message.text
          };
        }
        this.response = this.blankResponse();
      } else if (message.type === 'response') {
        const resp = message.response;
        if (resp) this.setMessage('');
        this.response = {
          ...(message.response || this.blankResponse()),
          loading: false
        };
        if (message.requestCanceled) {
          this.setMessage('Request canceled');
        }
      } else if (message.type === 'action') {
        this.setMessage('');
        // TODO
        console.log('REQUEST ACTION: ' + message.action);
      } else if (message.type === 'error') {
        this.response = this.blankResponse();
        this.setMessage(`Error: ${message.text}`);
      }
    },
    onUpdate(updatedRequest: Req) {
      this.request = updatedRequest;
      this.request.source = this.toYaml();
      this.update();
    },
    onUpdateSource(updatedSource: string) {
      try {
        const obj = yaml.load(this.file, updatedSource);
        this.request = {
          ...obj[this.request.name],
          name: this.request.name,
          source: updatedSource
        };
        this.update();
      } catch (err) {
        console.warn(`${err}`);
        console.debug(err);
      }
    },
    onUpdateMarkers(resource: string, markers: any) {
      vscode.postMessage({
        type: 'markers',
        resource,
        markers
      });
    },
    onAction(action: string, requestName: string) {
      this.setMessage('');
      if (action === 'run' || action === 'submit') {
        this.response.loading = true;
        time.logtime(`Webview sends: action-${action}`);
        vscode.postMessage({
          type: 'action',
          action,
          target: requestName
        });
      }
    },
    onCancel(requestName: string) {
      time.logtime('Webview sends: action-cancel');
      vscode.postMessage({
        type: 'action',
        action: 'cancel',
        target: requestName
      });
      this.setMessage('Request canceled');
      this.response = this.blankResponse();
    },
    update() {
      vscode.postMessage({ type: 'change', text: this.toYaml() });
      this.requestName = this.request.name;
    },
    focusRequestName() {
      location.hash = this.requestName;
      (document.querySelector('.request-name') as HTMLElement).focus();
    },
    setMessage(message: string) {
      this.message = message;
    },
    toYaml() {
      try {
        const { name, source: _source, ...bare } = this.request as any;
        return yaml.dump({ [name]: bare }, this.options.indent);
      } catch (err: unknown) {
        console.error(err);
        vscode.postMessage({
          type: 'alert',
          message: { level: 'error', text: `${err}` }
        });
        return '';
      }
    }
  }
});
</script>
