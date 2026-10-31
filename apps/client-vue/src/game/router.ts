import { createRouter, createWebHashHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router';
import LaunchView from './views/LaunchView.vue';
import LobbyView from './views/LobbyView.vue';
import TableView from './views/TableView.vue';
import ResultView from './views/ResultView.vue';

export const gameRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'launch', component: LaunchView },
  { path: '/lobby', name: 'lobby', component: LobbyView },
  { path: '/room/:roomId', name: 'table', component: TableView },
  { path: '/room/:roomId/result', name: 'result', component: ResultView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export function createGameRouter(history: RouterHistory = createWebHashHistory()) {
  return createRouter({
    history,
    routes: gameRoutes,
    scrollBehavior: () => ({ top: 0 }),
  });
}

export const router = createGameRouter();
