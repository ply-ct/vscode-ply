import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/theme-chalk/index.css';
import App from './App.vue';
import * as time from './util/time';

time.loglvl('debug');

time.logtime('Before create app');
createApp(App).use(ElementPlus).mount('#app');
