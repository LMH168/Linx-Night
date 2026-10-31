import { createApp } from 'vue';
import { createPinia } from 'pinia';
import GameApp from './game/GameApp.vue';
import { router } from './game/router';
import './game/game.css';
import './game/app.css';

createApp(GameApp).use(createPinia()).use(router).mount('#game');
