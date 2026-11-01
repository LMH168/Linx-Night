// Uses the production bundle and real REST/SSE server; only external AI sessions are a test fixture.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import {
  createApiServer,
  rooms,
  publishNewEvents,
  controllerManager,
} from "../apps/server/src/api.mjs";
import { appendEvent, privateState } from "../packages/domain/src/model.mjs";
import {
  submitVote,
  submitSpeech,
  announceDay,
} from "../packages/domain/src/engine.mjs";

let failPreparation = true;
const sessions = {
  ...controllerManager,
  requireHost: true,
  async prepare(room) {
    if (failPreparation) {
      failPreparation = false;
      throw Error("TEST_CONNECTION_FAILED");
    }
    return controllerManager.prepare(room);
  },
};
const { server: api } = createApiServer({ port: 0, sessions });
await new Promise((ok) => api.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${api.address().port}`;
const dist = resolve("apps/client-vue/dist");
const staticServer = createServer(async (req, res) => {
  const path = resolve(
    dist,
    "." +
      (new URL(req.url, base).pathname === "/"
        ? "/index.html"
        : new URL(req.url, base).pathname),
  );
  if (!path.startsWith(dist + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(path);
    res.setHeader(
      "content-type",
      {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".webp": "image/webp",
      }[extname(path)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => staticServer.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${staticServer.address().port}/?api=${encodeURIComponent(base)}`;
const targets = await fetch("http://127.0.0.1:9334/json/list").then((r) =>
  r.json(),
);
const ws = new WebSocket(
  targets.find((t) => t.type === "page").webSocketDebuggerUrl,
);
await new Promise((ok, no) => {
  ws.onopen = ok;
  ws.onerror = no;
});
let seq = 0;
let failSpeech = false;
const pending = new Map();
const errors = [];
const screenshots = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(msg.error) : p.resolve(msg.result);
  } else if (msg.method === "Fetch.requestPaused") {
    if (failSpeech) {
      failSpeech = false;
      void send("Fetch.failRequest", {
        requestId: msg.params.requestId,
        errorReason: "Failed",
      });
    } else
      void send("Fetch.continueRequest", { requestId: msg.params.requestId });
  } else if (msg.method === "Runtime.exceptionThrown")
    errors.push(
      msg.params.exceptionDetails.exception?.description ||
        msg.params.exceptionDetails.text,
    );
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++seq, { resolve, reject });
    ws.send(JSON.stringify({ id: seq, method, params }));
  });
const js = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const delay = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await js(expression)) return;
    await delay(100);
  }
  throw Error("Timed out: " + expression);
}
async function click(text) {
  await until(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});return b && !b.disabled})()`,
  );
  await js(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});if(b.disabled)throw Error('Disabled button: '+${JSON.stringify(text)});b.click()})()`,
  );
}
async function input(selector, value) {
  await js(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
}
const out = resolve(
  process.env.ECLIPSE_SCREENSHOTS || "artifacts/eclipse-live",
);
await mkdir(out, { recursive: true });
async function shot(name) {
  await delay(450);
  const layout = await js(
    `({width:innerWidth,scroll:document.documentElement.scrollWidth,offscreen:[...document.querySelectorAll('button,input,textarea,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0 && (r.left < -2 || r.right > innerWidth+2)}).map(e=>e.textContent.trim().slice(0,50))})`,
  );
  assert(layout.scroll <= layout.width + 2, JSON.stringify(layout));
  assert.deepEqual(layout.offscreen, []);
  const data = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    resolve(out, name + ".png"),
    Buffer.from(data.data, "base64"),
  );
  screenshots.push(name);
}
function change(room, phase, currentSeatId = null) {
  room.phase = phase;
  room.currentSeatId = currentSeatId;
  appendEvent(room, {
    type: "game.phase_changed",
    data: { phase, seatId: currentSeatId },
  });
  publishNewEvents(room);
}
try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await until("!!document.querySelector('.entry input')");
  await js("sessionStorage.clear()");
  await until(
    "[...document.querySelectorAll('.roles img')].filter(i=>i.complete&&i.naturalWidth>0).length===5",
  );
  await shot("01-entry-1600");
  await input(".entry input", "今夜旅人");
  await click("创建房间 →");
  await until("!!document.querySelector('.room-info')");
  const id = await js("sessionStorage.getItem('linx-room')");
  const player = await js("sessionStorage.getItem('linx-player')");
  const room = rooms.get(id);
  await click("返回入口");
  await input(".entry input", "林间来客");
  await input(".join input", id);
  await click("加入房间");
  await until(
    "document.querySelector('.room-info')?.textContent.includes('你是加入者')",
  );
  assert.equal(
    await js(
      "document.querySelector('.room-info').textContent.includes('添加一名 AI')",
    ),
    false,
  );
  await shot("02-guest-waiting");
  await js(
    `sessionStorage.setItem('linx-room',${JSON.stringify(id)});sessionStorage.setItem('linx-player',${JSON.stringify(player)});sessionStorage.setItem('linx-name','今夜旅人')`,
  );
  await send("Page.reload");
  await until(
    "document.querySelector('.room-info')?.textContent.includes('你是房主')",
  );
  await click("补齐 AI 空位");
  await until(
    "document.querySelector('.room-info').textContent.includes('9 / 9')",
  );
  await js("document.querySelector('.rename').click()");
  await input(".dialog input", "松林访客");
  await click("保存名称");
  await until(
    "document.querySelector('.table-zone').textContent.includes('松林访客')",
  );
  await shot("02-lobby-1600");
  await click("开始准备 →");
  await until(
    "document.querySelector('.preparation')?.textContent.includes('重试连接')",
  );
  await shot("03-preparation-failure");
  await click("重试连接");
  await until("!!document.querySelector('.council-stage')");
  const roleOrder = [
    "seer",
    "werewolf",
    "villager",
    "witch",
    "werewolf",
    "hunter",
    "villager",
    "werewolf",
    "villager",
  ];
  room.seats.forEach((s, i) => {
    s.role = roleOrder[i];
    s.camp = s.role === "werewolf" ? "werewolf" : "good";
    s.skills = {
      antidoteAvailable: s.role === "witch",
      poisonAvailable: s.role === "witch",
      hunterShotAvailable: s.role === "hunter",
    };
  });
  room.pendingNight = { wolfTarget: "P7", eligibleSeatIds: ["P1", "P4"] };
  change(room, "NIGHT_SEER");
  await until(
    "document.querySelector('.council-hub').textContent.includes('预言家行动')",
  );
  assert.equal(
    await js("document.querySelectorAll('.council-ring img').length"),
    0,
  );
  await click("查看身份");
  assert.equal(
    await js("document.querySelectorAll('.council-ring img').length"),
    1,
  );
  await shot("04-seer-night");
  await click("收起身份");
  await js("document.querySelector('.council-seat:nth-of-type(2)').click()");
  await click("确认行动");
  await until("!document.querySelector('.action-panel select')");
  assert.equal(privateState(room, player).seerResults.length, 1);
  change(room, "SPEECH", "P1");
  await until("!!document.querySelector('textarea')");
  await input(
    ".action-panel textarea",
    "我先听大家发言，再根据查验与票型判断。",
  );
  await shot("05-speech-1600");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await shot("06-table-1280");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await shot("07-table-mobile");
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  api.closeAllConnections();
  await until("!!document.querySelector('.connection-banner')");
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await until("!document.querySelector('.connection-banner')");
  failSpeech = true;
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/speeches", requestStage: "Request" }],
  });
  await click("确认提交发言");
  await until(
    "document.querySelector('.action-message')?.textContent.includes('提交失败')",
  );
  await send("Fetch.disable");
  assert.equal(
    await js("document.querySelector('textarea').value"),
    "我先听大家发言，再根据查验与票型判断。",
  );
  await click("确认提交发言");
  await until("!document.querySelector('textarea')");
  assert(room.speeches.some((s) => s.text.includes("我先听大家")));
  room.votes = [];
  room.voteResolutions = [];
  room.seats[8].alive = false;
  room.submittedVoteSeatIds = [];
  room.phase = "VOTE";
  room.seats
    .filter((s) => s.alive)
    .forEach((s, i) =>
      submitVote(room, s.seatId, i % 2 ? "P2" : "P3", "browser-initial-" + i),
    );
  publishNewEvents(room);
  await until(
    "document.querySelector('.council-hub')?.textContent.includes('PK 候选发言')",
  );
  submitSpeech(room, "P2", "二号 PK 发言", "browser-pk-speech2");
  submitSpeech(room, "P3", "三号 PK 发言", "browser-pk-speech3");
  publishNewEvents(room);
  await until(
    "document.querySelector('.action-panel')?.textContent.includes('确认投票')",
  );
  assert.deepEqual(
    await js(
      "[...document.querySelectorAll('.action-panel select option')].map(o=>o.value).filter(Boolean)",
    ),
    ["P2", "P3"],
  );
  await shot("08-pk-mobile");
  await js(
    "const s=document.querySelector('.action-panel select');s.value='P2';s.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await click("确认投票");
  await until(
    "document.querySelector('.action-panel')?.textContent.includes('你已投票')",
  );
  assert.equal(room.votes.filter((v) => v.pk).length, 1);
  assert.equal(room.voteResolutions.length, 1);
  room.pk = null;
  room.seats[0].role = "hunter";
  room.seats[0].skills.hunterShotAvailable = true;
  room.phase = "DAY_ANNOUNCEMENT";
  room.round = 1;
  room.pendingNight = { wolfTarget: "P1" };
  announceDay(room);
  publishNewEvents(room);
  await until(
    "document.querySelector('.action-panel')?.textContent.includes('确认开枪')",
  );
  assert.equal(
    (await fetch(base + `/api/rooms/${id}/state`).then((r) => r.json())).state
      .phase,
    "RESOLUTION",
  );
  await shot("09-hunter-mobile");
  await click("放弃开枪");
  await until(
    "!document.querySelector('.action-panel')?.textContent.includes('确认开枪')",
  );
  await click("结束本局");
  await click("确认结束");
  await until("!!document.querySelector('.council-result')");
  await shot("10-result-mobile");
  await send("Page.reload");
  await until("!!document.querySelector('.council-result')");
  assert.equal(
    await js("document.querySelectorAll('.result-roles img').length"),
    9,
    "settlement must restore after ended room deletion",
  );
  await click("返回大厅");
  await until("!!document.querySelector('.entry')");
  assert.equal(await js("sessionStorage.getItem('linx-player')"), null);
  await shot("11-entry-mobile");
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        errors,
        screenshots,
        checks: [
          "create/join/host permissions/fill/rename",
          "disconnect recovery/draft preservation",
          "preparation failure/retry",
          "private art masking",
          "real skill/speech",
          "PK restricted targets/vote",
          "private hunter window",
          "host end/settlement reload/new lobby",
          "1600/1280/390 layouts",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, screenshots: out, checks: 11 }));
} finally {
  ws.close();
  rooms.clear();
  api.closeAllConnections();
  api.close();
  staticServer.closeAllConnections();
  staticServer.close();
}
