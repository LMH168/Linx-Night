#!/usr/bin/env node
/**
 * 线上产物探针 —— issue #135 的部署侧验收
 *
 * 不启动浏览器，只抓取线上 HTML 与 JS bundle，回答四个问题：
 *   1. 生产环境实际加载的是哪个入口（3D 还是 legacy）
 *   2. bundle 里是否还残留 iframe 世界 / 实时点光源 / 每阶段 setSize
 *   3. 首屏 JS/CSS 体积多大
 *   4. 关键静态资源是否可访问
 *
 * 用法：
 *   node tools/probe-deployment.mjs                      # 默认站点
 *   node tools/probe-deployment.mjs https://example.com  # 指定站点
 *
 * 退出码：0 全部符合预算；1 发现违规；2 网络/解析失败。
 */

const BASE = (process.argv[2] || 'https://linxnight.mimi-api.cn').replace(/\/+$/, '');

const BUDGET = {
  firstPartyJsKb: 420,     // 首屏自有 JS（不含 three 运行时按需）
  forestCabinRefs: 0,      // 不允许再指向 1.6MB 的 iframe 场景
  iframeWorld: 0,
};

const PATTERNS = [
  ['forest-cabin', /forest-cabin/g, BUDGET.forestCabinRefs],
  ['<iframe 世界', /createElement\("iframe"\)|<iframe/gi, BUDGET.iframeWorld],
];

async function main() {
  const report = { base: BASE, entries: [], bundles: [], assets: [], violations: [] };

  let html;
  try {
    const res = await fetch(`${BASE}/`, { redirect: 'follow' });
    if (!res.ok) throw new Error(`GET / -> ${res.status}`);
    html = await res.text();
    report.status = res.status;
  } catch (error) {
    console.error(`无法访问站点：${error.message}`);
    return 2;
  }

  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [, '(无标题)'])[1];
  report.entries = scripts;

  console.log(`\n站点      ${BASE}`);
  console.log(`标题      ${title}`);
  console.log(`HTML      ${html.length} B`);
  console.log(`脚本      ${scripts.join(', ') || '(无)'}`);
  console.log(`样式      ${styles.join(', ') || '(无)'}`);

  const looks3D = scripts.some((s) => /game-main/.test(s));
  console.log(`入口判定  ${looks3D ? '3D 页面（game-main）' : '非 3D 入口'}`);

  let jsBytes = 0;
  for (const src of scripts) {
    try {
      const res = await fetch(`${BASE}${src}`);
      const text = await res.text();
      jsBytes += text.length;
      const counts = {};
      for (const [label, pattern, limit] of PATTERNS) {
        const n = (text.match(pattern) || []).length;
        counts[label] = n;
        if (n > limit) {
          report.violations.push(`${src} 含 ${label} ×${n}（预算 ${limit}）`);
        }
      }
      for (const key of ['PointLight', 'SpotLight', 'setSize', 'requestAnimationFrame', 'InstancedMesh', 'mergeGeometries']) {
        counts[key] = (text.match(new RegExp(key, 'g')) || []).length;
      }
      report.bundles.push({ src, bytes: text.length, counts });
      console.log(`\n  bundle  ${src}`);
      console.log(`    体积        ${(text.length / 1024).toFixed(1)} KB`);
      for (const [k, v] of Object.entries(counts)) {
        console.log(`    ${k.padEnd(18)} ${v}`);
      }
    } catch (error) {
      report.violations.push(`${src} 拉取失败：${error.message}`);
    }
  }

  const jsKb = jsBytes / 1024;
  console.log(`\n  首屏 JS 合计  ${jsKb.toFixed(1)} KB`);
  if (jsKb > BUDGET.firstPartyJsKb) {
    report.violations.push(`首屏 JS ${jsKb.toFixed(1)} KB 超预算 ${BUDGET.firstPartyJsKb} KB`);
  }

  for (const path of ['/assets/splash/forest-cabin.html', '/assets/game/noise.png', '/api/health']) {
    try {
      const res = await fetch(`${BASE}${path}`, { method: 'HEAD' });
      const size = Number(res.headers.get('content-length') || 0);
      report.assets.push({ path, status: res.status, bytes: size });
      console.log(`  ${String(res.status).padEnd(4)} ${String(size || '-').padStart(9)} B  ${path}`);
    } catch (error) {
      console.log(`  ERR  ${path}  ${error.message}`);
    }
  }

  console.log('');
  if (report.violations.length) {
    console.log('结论：FAIL');
    for (const v of report.violations) console.log(`  - ${v}`);
    return 1;
  }
  console.log('结论：PASS（未发现 iframe 世界与 forest-cabin 引用）');
  return 0;
}

main()
  .then((code) => {
    // 用 exitCode 而不是 process.exit()：管道下 stdout 是异步写，强退会截断输出
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
