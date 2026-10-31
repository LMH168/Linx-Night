import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkConfig} from './check-config.mjs';
const file=process.argv[2];
if(!file){console.error('用法：node scripts/start-local.mjs <仓库外环境文件>');process.exit(1);}
try{loadEnvFile(file);}catch{console.error('无法加载环境文件，请检查本机路径');process.exit(1);}
process.env.APP_HOST = process.env.APP_HOST || '127.0.0.1';
process.env.CLIENT_HOST = process.env.CLIENT_HOST || process.env.APP_HOST;
process.env.CLIENT_UI = process.env.CLIENT_UI || 'vue';
process.env.CLIENT_DIST = process.env.CLIENT_DIST || fileURLToPath(new URL('../apps/client-vue/dist', import.meta.url));
if (process.env.CLIENT_UI === 'vue' && !existsSync(process.env.CLIENT_DIST)) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build:client-vue'], { stdio: 'inherit' });
  if (build.status !== 0) { console.error('Vue 客户端构建失败，请先运行 npm.cmd ci 和 npm.cmd run build:client-vue'); process.exit(build.status || 1); }
}
const result=await checkConfig();
if(!result.ok){console.error(`配置未就绪：${result.missing.join(', ')}`);process.exit(1);}
console.log(`本机网页：http://localhost:${process.env.CLIENT_PORT||5010}；房间重启后失效。`);
await import('../run.mjs');
