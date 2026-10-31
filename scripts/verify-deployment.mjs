const [clientUrl, apiUrl, expectedBuild] = process.argv.slice(2);
if (!clientUrl || !apiUrl || !expectedBuild) throw new Error('用法：node scripts/verify-deployment.mjs <客户端地址> <API地址> <构建标识>');

const response = await fetch(clientUrl, { signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error(`客户端返回 ${response.status}`);
const actualBuild = response.headers.get('x-linx-client-build');
if (actualBuild !== expectedBuild) throw new Error(`客户端构建不匹配：期望 ${expectedBuild}，实际 ${actualBuild || '缺失'}`);

const health = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
if (!health.ok) throw new Error(`API 健康检查返回 ${health.status}`);
console.log(`部署验证通过：client=${actualBuild} api=${health.status}`);
