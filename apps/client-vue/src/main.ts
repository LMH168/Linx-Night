import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import './styles/cabin-scene.css';

createApp(App).use(createPinia()).mount('#app');
