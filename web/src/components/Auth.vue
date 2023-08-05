<template>
  <el-popover
    :visible="popVisible"
    popper-class="auth-popper"
    placement="bottom"
    title="Request Auth"
    :width="600"
  >
    <div class="grid-form" tabindex="30">
      <label>Auth Type</label>
      <el-select v-model="authType" placeholder="Select" @change="onChange">
        <el-option value="None" />
        <el-option value="Basic" />
        <el-option value="Bearer" />
      </el-select>
      <label v-if="authType === 'Basic'">Username</label>
      <el-input v-if="authType === 'Basic'" v-model="username" @change="onChange" />
      <label v-if="authType === 'Basic'">Password</label>
      <el-input
        v-if="authType === 'Basic'"
        v-model="password"
        type="password"
        show-password
        @change="onChange"
      />
      <label v-if="authType === 'Bearer'">Token</label>
      <el-input v-if="authType === 'Bearer'" v-model="token" @change="onChange" />
    </div>
    <template #reference>
      <img
        ref="trigger"
        class="icon"
        :src="`${iconBase}/auth.svg`"
        alt="Request Auth"
        title="Request Auth"
        @click="popVisible = !popVisible"
      />
    </template>
  </el-popover>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { ElPopover, ElSelect } from 'element-plus';

export default defineComponent({
  name: 'Auth',
  props: {
    iconBase: {
      type: String,
      required: true
    },
    authHeader: {
      type: String,
      default: null
    }
  },
  emits: ['authChange'],
  data() {
    return {
      popVisible: false,
      authType: 'None' as 'None' | 'Basic' | 'Bearer',
      username: '',
      password: '',
      token: ''
    };
  },
  setup() {
    return {
      trigger: ref<HTMLImageElement>()
    };
  },
  mounted() {
    if (this.authHeader?.toLowerCase().startsWith('basic ')) {
      const creds = this.fromBase64(this.authHeader.substring(6).trim()).split(':');
      if (creds.length >= 2) {
        this.authType = 'Basic';
        this.username = creds[0];
        this.password = creds.slice(1).join(':');
      }
    } else if (this.authHeader?.toLowerCase().startsWith('bearer ')) {
      this.authType = 'Bearer';
      this.token = this.authHeader.substring(7).trim();
    }

    // close popover on click outside
    document.onclick = (evt: MouseEvent) => {
      if (evt.target !== this.trigger) {
        if (evt.target instanceof Node) {
          const popper = document.getElementsByClassName('auth-popper').item(0);
          if (!popper?.contains(evt.target)) {
            this.popVisible = false;
          }
        }
      }
    };
  },
  methods: {
    toBase64(input: string): string {
      const bytes = new TextEncoder().encode(input);
      const binString = Array.from(bytes, (x) => String.fromCodePoint(x)).join('');
      return btoa(binString);
    },
    fromBase64(input: string): string {
      const binString = atob(input);
      const uintArray = Uint8Array.from(binString, (m): number => m.codePointAt(0) || 0);
      return new TextDecoder().decode(uintArray);
    },
    onChange() {
      if (this.authType === 'None') {
        this.username = this.password = this.token = '';
        this.$emit('authChange', 'auth');
      } else if (this.authType === 'Basic') {
        this.token = '';
        if (this.username && this.password) {
          this.$emit(
            'authChange',
            'auth',
            'Basic ' + this.toBase64(`${this.username}:${this.password}`)
          );
        }
      } else if (this.authType === 'Bearer') {
        this.username = this.password = '';
        if (this.token) {
          this.$emit('authChange', 'auth', 'Bearer ' + this.token);
        }
      }
    }
  }
});
</script>
