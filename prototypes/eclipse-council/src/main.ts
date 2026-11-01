import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'
import { useGameStore } from './stores/game'
import { useSettingsStore } from './stores/settings'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

// 开发期调试入口：仅供 tools/audit.mjs 读取内部状态，生产构建会被移除
if (import.meta.env.DEV) {
  Object.assign(window, { __eclipse: { game: useGameStore(), settings: useSettingsStore() } })
}
