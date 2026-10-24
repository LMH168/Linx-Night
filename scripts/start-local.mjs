import {loadEnvFile} from 'node:process';
import {checkConfig} from './check-config.mjs';
const file=process.argv[2];
if(!file){console.error('用法：node scripts/start-local.mjs <仓库外环境文件>');process.exit(1);}
try{loadEnvFile(file);}catch{console.error('无法加载环境文件，请检查本机路径');process.exit(1);}
process.env.CLIENT_HOST='127.0.0.1';
const result=await checkConfig();
if(!result.ok){console.error(`配置未就绪：${result.missing.join(', ')}`);process.exit(1);}
console.log(`本机网页：http://localhost:${process.env.CLIENT_PORT||5010}；房间重启后失效。`);
await import('../run.mjs');
