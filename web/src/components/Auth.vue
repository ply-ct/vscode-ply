<template>
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
    <label class="note"
      >Note: The Authorization header is populated from values entered here. For sensitive
      credentials, you can use
      <a href="https://ply-ct.org/ply/topics/values">Value Expressions</a> to directly set
      Authorization via the Headers tab.</label
    >
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Auth',
  props: {
    authHeader: {
      type: String,
      default: null
    }
  },
  emits: ['authChange'],
  data() {
    return {
      authType: 'None' as 'None' | 'Basic' | 'Bearer',
      username: '',
      password: '',
      token: ''
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
        this.$emit('authChange');
      } else if (this.authType === 'Basic') {
        this.token = '';
        if (this.username && this.password) {
          this.$emit('authChange', 'Basic ' + this.toBase64(`${this.username}:${this.password}`));
        }
      } else if (this.authType === 'Bearer') {
        this.username = this.password = '';
        if (this.token) {
          this.$emit('authChange', 'Bearer ' + this.token);
        }
      }
    }
  }
});
</script>
