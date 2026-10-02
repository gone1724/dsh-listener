// src/index.ts
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { readFile as readFile2 } from "node:fs/promises";

// src/shared.ts
var BASE = "/dsh-listener";
var DEFAULT_MODEL = "qwen-audio-3.1-asr-flash-streaming";
var SAMPLE_RATE = 16e3;
var MAX_AUDIO_BYTES = 16e3 * 2 * 120;
var MAX_BUFFER_BYTES = 16e3 * 2 * 15;
var VERSION = "0.4.0";
var defaults = {
  model: DEFAULT_MODEL,
  region: "beijing",
  workspaceId: "",
  hotkey: "AltRight",
  mode: "hold",
  autoSend: false,
  updateSource: "official",
  mirrorUrl: "https://registry.npmmirror.com"
};
function validateUpdateSource(input, requireMirror = true) {
  const updateSource = input.updateSource ?? "official";
  if (updateSource !== "official" && updateSource !== "mirror") throw new Error("\u66F4\u65B0\u4E0B\u8F7D\u6765\u6E90\u65E0\u6548");
  if (input.mirrorUrl !== void 0 && typeof input.mirrorUrl !== "string") throw new Error("\u955C\u50CF\u7F51\u5740\u65E0\u6548");
  const previousUrl = (input.mirrorUrl ?? "").trim().replace(/\/+$/, "");
  const mirrorUrl = /^https:\/\/(?:gh-proxy\.(?:org|com)|ghproxy\.com)(?:\/|$)/i.test(previousUrl) ? defaults.mirrorUrl : previousUrl;
  if (mirrorUrl) {
    try {
      const url = new URL(mirrorUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || mirrorUrl.length > 512) throw new Error();
    } catch {
      throw new Error("\u955C\u50CF\u7F51\u5740\u987B\u4E3A HTTPS npm registry \u5730\u5740\uFF0C\u4E0D\u5305\u542B\u8D26\u53F7\u3001\u67E5\u8BE2\u53C2\u6570\u6216\u4E0B\u8F7D\u94FE\u63A5");
    }
  }
  if (requireMirror && updateSource === "mirror" && !mirrorUrl) throw new Error("\u8BF7\u5148\u586B\u5199 npm \u955C\u50CF\u7F51\u5740");
  return { updateSource, mirrorUrl: mirrorUrl.replace(/\/+$/, "") };
}
function validatePreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("\u8BBE\u7F6E\u683C\u5F0F\u65E0\u6548");
  const p = input;
  if (typeof p.model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(p.model)) throw new Error("\u6A21\u578B\u540D\u79F0\u65E0\u6548");
  if (p.region !== "beijing" && p.region !== "singapore") throw new Error("\u5730\u57DF\u65E0\u6548");
  if (typeof p.workspaceId !== "string" || !/^[a-zA-Z0-9-]{0,64}$/.test(p.workspaceId)) throw new Error("Workspace ID \u65E0\u6548");
  if (typeof p.hotkey !== "string" || !/^(?:(?:Control|Shift|Alt|Meta)\+)*(?:AltRight|AltLeft|ControlRight|ControlLeft|ShiftRight|ShiftLeft|MetaRight|MetaLeft|Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Space)$/.test(p.hotkey)) throw new Error("\u5FEB\u6377\u952E\u65E0\u6548");
  if (p.mode !== "hold" && p.mode !== "toggle") throw new Error("\u5F55\u97F3\u6A21\u5F0F\u65E0\u6548");
  if (typeof p.autoSend !== "boolean") throw new Error("\u81EA\u52A8\u53D1\u9001\u8BBE\u7F6E\u65E0\u6548");
  const source = validateUpdateSource({ updateSource: p.updateSource, mirrorUrl: p.mirrorUrl ?? defaults.mirrorUrl }, false);
  return { model: p.model, region: p.region, workspaceId: p.workspaceId, hotkey: p.hotkey, mode: p.mode, autoSend: p.autoSend, ...source };
}
function upstreamUrl(p) {
  const region = p.region === "beijing" ? "cn-beijing" : "ap-southeast-1";
  const host = p.workspaceId ? `${p.workspaceId}.${region}.maas.aliyuncs.com` : p.region === "beijing" ? "dashscope.aliyuncs.com" : "dashscope-intl.aliyuncs.com";
  return `wss://${host}/api-ws/v1/inference`;
}
function joinText(left, right) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return left + right;
  return left + (/[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right) ? " " : "") + right;
}

// src/host/http-channel.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/host/bailian.ts
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
var connect = (url, key) => new WebSocket(url, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 1e4, maxPayload: 1024 * 1024 });
var BailianTask = class {
  constructor(p, key, emit, factory = connect) {
    this.emit = emit;
    this.socket = factory(upstreamUrl(p), key);
    this.timer = setTimeout(() => this.fail("\u767E\u70BC\u8FDE\u63A5\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u548C\u914D\u7F6E"), 15e3);
    this.deadline = setTimeout(() => this.fail("\u5F55\u97F3\u8D85\u8FC7 120 \u79D2\uFF0C\u5DF2\u53D6\u6D88"), 125e3);
    this.socket.on("open", () => {
      if (this.ended) return;
      this.socket.send(JSON.stringify({
        header: { action: "run-task", task_id: this.taskId, streaming: "duplex" },
        payload: {
          task_group: "audio",
          task: "asr",
          function: "recognition",
          model: p.model,
          parameters: { format: "pcm", sample_rate: SAMPLE_RATE },
          input: {}
        }
      }));
    });
    this.socket.on("message", (raw) => this.message(raw));
    this.socket.on("error", (error) => {
      const code = String(error?.code ?? "").replace(/[^A-Z0-9_]/g, "").slice(0, 40);
      this.fail(`\u767E\u70BC\u8FDE\u63A5\u5931\u8D25${code ? `\uFF08${code}\uFF09` : ""}\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u5730\u57DF\u548C Workspace ID`);
    });
    this.socket.on("unexpected-response", (_req, response) => {
      this.fail(`\u767E\u70BC\u8FDE\u63A5\u5931\u8D25\uFF08HTTP ${response.statusCode}\uFF09\u3002${response.statusCode === 401 || response.statusCode === 403 ? "\u8BF7\u68C0\u67E5\u5BC6\u94A5\u6709\u6548\u6027\u3001\u5730\u57DF\u3001Workspace ID \u548C\u6A21\u578B\u6743\u9650\u3002" : "\u8BF7\u68C0\u67E5 Workspace ID\u3001\u670D\u52A1\u5730\u5740\u548C\u7F51\u7EDC\u3002"}`);
    });
    this.socket.on("close", () => {
      if (!this.ended) this.fail("\u767E\u70BC\u8FDE\u63A5\u63D0\u524D\u5173\u95ED\uFF0C\u8BC6\u522B\u672A\u5B8C\u6210");
    });
  }
  taskId = randomUUID().replaceAll("-", "");
  socket;
  ready = false;
  finishing = false;
  finishSent = false;
  ended = false;
  bytes = 0;
  queuedBytes = 0;
  queue = [];
  sentences = /* @__PURE__ */ new Map();
  timer;
  deadline;
  sendAudio(audio) {
    if (this.ended) return;
    if (this.finishing) {
      this.fail("\u505C\u6B62\u540E\u6536\u5230\u97F3\u9891\uFF0C\u5F55\u97F3\u534F\u8BAE\u65E0\u6548");
      return;
    }
    if (!audio.length || audio.length % 2 || audio.length > 32e3) {
      this.fail("PCM \u97F3\u9891\u5206\u5757\u65E0\u6548");
      return;
    }
    if (!this.bytes) {
      clearTimeout(this.deadline);
      this.deadline = setTimeout(() => this.fail("\u5F55\u97F3\u8D85\u8FC7 120 \u79D2\uFF0C\u5DF2\u53D6\u6D88"), 125e3);
    }
    this.bytes += audio.length;
    if (this.bytes > MAX_AUDIO_BYTES) {
      this.fail("\u5F55\u97F3\u8D85\u8FC7 120 \u79D2\uFF0C\u5DF2\u53D6\u6D88");
      return;
    }
    if (!this.ready) {
      this.queuedBytes += audio.length;
      if (this.queuedBytes > MAX_BUFFER_BYTES) {
        this.fail("\u767E\u70BC\u8FDE\u63A5\u8FC7\u6162\uFF0C\u5DF2\u53D6\u6D88\u5F55\u97F3");
        return;
      }
      this.queue.push(Buffer.from(audio));
    } else if (this.socket.bufferedAmount > MAX_BUFFER_BYTES) this.fail("\u4E0A\u4F20\u7F51\u7EDC\u8FC7\u6162\uFF0C\u5DF2\u53D6\u6D88\u5F55\u97F3");
    else this.socket.send(audio);
  }
  finish() {
    if (this.ended || this.finishing) return;
    if (!this.bytes) {
      this.fail("\u6CA1\u6709\u91C7\u96C6\u5230\u97F3\u9891");
      return;
    }
    this.finishing = true;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = setTimeout(() => this.fail("\u7B49\u5F85\u6700\u7EC8\u8BC6\u522B\u7ED3\u679C\u8D85\u65F6"), 2e4);
    this.flushFinish();
  }
  cancel() {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.queue = [];
    this.sentences.clear();
    this.socket.terminate();
  }
  fail(message) {
    if (this.ended) return;
    this.cancel();
    this.emit({ type: "error", message });
  }
  flushFinish() {
    if (!this.ready || !this.finishing || this.finishSent || this.ended) return;
    this.finishSent = true;
    this.socket.send(JSON.stringify({ header: { action: "finish-task", task_id: this.taskId, streaming: "duplex" }, payload: { input: {} } }));
  }
  message(raw) {
    if (this.ended) return;
    let e;
    try {
      e = JSON.parse(raw.toString());
    } catch {
      this.fail("\u767E\u70BC\u8FD4\u56DE\u4E86\u65E0\u6548\u6570\u636E");
      return;
    }
    if (e?.header?.task_id !== this.taskId) return;
    switch (e.header.event) {
      case "task-started": {
        if (this.ready) return;
        this.ready = true;
        if (!this.finishing) clearTimeout(this.timer);
        for (const chunk of this.queue) this.socket.send(chunk);
        this.queue = [];
        this.queuedBytes = 0;
        this.emit({ type: "ready" });
        this.flushFinish();
        break;
      }
      case "result-generated": {
        const output = e.payload?.output;
        const s = output?.sentence ?? output?.output?.sentence;
        if (!s || s.heartbeat === true || typeof s.text !== "string") return;
        if (s.sentence_end === true && Number.isInteger(s.sentence_id) && s.sentence_id > 0) this.sentences.set(s.sentence_id, s.text);
        const final = this.text();
        this.emit({ type: "partial", text: s.sentence_end === true ? final : joinText(final, s.text) });
        break;
      }
      case "task-finished": {
        if (!this.finishSent) {
          this.fail("\u767E\u70BC\u4EFB\u52A1\u610F\u5916\u7ED3\u675F");
          return;
        }
        const text = this.text().trim();
        this.ended = true;
        clearTimeout(this.timer);
        clearTimeout(this.deadline);
        this.emit({ type: "final", text });
        this.sentences.clear();
        this.socket.close();
        break;
      }
      case "task-failed":
        this.fail(`\u767E\u70BC\u8BC6\u522B\u5931\u8D25\uFF08${String(e.header.error_code ?? "UNKNOWN").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80)}\uFF09\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u4E0E\u914D\u7F6E`);
    }
  }
  text() {
    return [...this.sentences].sort(([a], [b]) => a - b).reduce((text, [, sentence]) => joinText(text, sentence), "");
  }
};

// src/host/http-channel.ts
function reply(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function mountHttpChannel(ctx, preferences, keyRef2, factory = (p, k, emit) => new BailianTask(p, k, emit), updating = () => false) {
  const entries = /* @__PURE__ */ new Map();
  let creating = 0, disposed = false;
  const active = () => creating + [...entries.values()].filter((e) => !e.ended).length;
  const remove = (id, entry) => {
    entry.ended = true;
    entry.task?.cancel();
    for (const wake of entry.wake) wake();
    entries.delete(id);
  };
  const sweep = setInterval(() => {
    for (const [id, entry] of entries) if (Date.now() - entry.touched > 3e4) remove(id, entry);
  }, 5e3);
  const unregister = ctx.webServer.register({ kind: "exact", path: `${BASE}/channel`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req);
    if ("rejection" in admission) {
      reply(res, admission.rejection, { error: "Harness \u767B\u5F55\u6216\u9875\u9762\u6765\u6E90\u9A8C\u8BC1\u5931\u8D25" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const action = url.searchParams.get("action"), id = url.searchParams.get("id") ?? "";
    try {
      if (req.method === "POST" && action === "start") {
        if (updating()) {
          reply(res, 503, { error: "\u8BED\u97F3\u63D2\u4EF6\u6B63\u5728\u66F4\u65B0\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" });
          return;
        }
        if (disposed || active() >= 4 || entries.size >= 64) {
          reply(res, 503, { error: "\u8BED\u97F3\u901A\u9053\u5FD9\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" });
          return;
        }
        creating++;
        try {
          const key = await ctx.credentials.resolve(keyRef2);
          if (res.destroyed) return;
          if (!key) {
            reply(res, 400, { error: "\u5C1A\u672A\u914D\u7F6E\u767E\u70BC API Key" });
            return;
          }
          if (disposed) {
            reply(res, 503, { error: "\u8BED\u97F3\u63D2\u4EF6\u6B63\u5728\u66F4\u65B0" });
            return;
          }
          const id2 = randomUUID2(), entry2 = { events: [], seq: 0, ended: false, touched: Date.now(), wake: /* @__PURE__ */ new Set() };
          entries.set(id2, entry2);
          res.once("close", () => {
            if (!res.writableFinished) remove(id2, entry2);
          });
          try {
            entry2.task = factory(preferences(), key.value, (event) => {
              entry2.events.push({ seq: ++entry2.seq, event });
              if (entry2.events.length > 256) entry2.events.shift();
              if (event.type === "final" || event.type === "error") entry2.ended = true;
              for (const wake of entry2.wake) wake();
            });
          } catch {
            remove(id2, entry2);
            throw new Error("initialize");
          }
          reply(res, 200, { id: id2 });
          return;
        } finally {
          creating--;
        }
      }
      const entry = entries.get(id);
      if (!entry) {
        reply(res, 404, { error: "\u5F55\u97F3\u4F1A\u8BDD\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u5F00\u59CB" });
        return;
      }
      entry.touched = Date.now();
      if (req.method === "GET" && action === "events") {
        const after = Number(url.searchParams.get("after") ?? 0);
        if (!Number.isSafeInteger(after) || after < 0 || after > entry.seq) {
          reply(res, 400, { error: "\u4E8B\u4EF6\u5E8F\u53F7\u65E0\u6548" });
          return;
        }
        if (entry.seq === after && !entry.ended) await new Promise((resolve) => {
          const done = () => {
            clearTimeout(timer);
            entry.wake.delete(done);
            res.off("close", done);
            resolve();
          };
          const timer = setTimeout(done, 15e3);
          entry.wake.add(done);
          res.once("close", done);
        });
        if (!res.destroyed) reply(res, 200, { events: entry.events.filter((e) => e.seq > after), ended: entry.ended });
        return;
      }
      if (req.method !== "POST") {
        reply(res, 405, { error: "\u65B9\u6CD5\u4E0D\u652F\u6301" });
        return;
      }
      if (action === "cancel") {
        remove(id, entry);
        reply(res, 200, { ok: true });
        return;
      }
      if (entry.ended) {
        reply(res, 409, { error: "\u5F55\u97F3\u5DF2\u7ED3\u675F" });
        return;
      }
      if (action === "audio") {
        if (req.headers["content-type"] !== "application/octet-stream") {
          reply(res, 415, { error: "\u9700\u8981 PCM \u4E8C\u8FDB\u5236\u97F3\u9891" });
          return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32e3) {
            remove(id, entry);
            reply(res, 413, { error: "\u97F3\u9891\u5206\u5757\u8FC7\u5927" });
            return;
          }
          ;
          chunks.push(chunk);
        }
        entry.task?.sendAudio(Buffer.concat(chunks));
      } else if (action === "finish") entry.task?.finish();
      else {
        reply(res, 400, { error: "\u64CD\u4F5C\u65E0\u6548" });
        return;
      }
      reply(res, 200, { ok: true });
    } catch {
      if (!res.headersSent) reply(res, 500, { error: "Harness \u65E0\u6CD5\u521D\u59CB\u5316\u8BED\u97F3\u4EFB\u52A1\uFF0C\u8BF7\u68C0\u67E5\u51ED\u636E\u5B58\u50A8\u548C\u914D\u7F6E" });
    }
  } });
  return { active, dispose: () => {
    disposed = true;
    clearInterval(sweep);
    unregister();
    for (const [id, entry] of entries) remove(id, entry);
  } };
}

// src/host/management.ts
import PluginManager from "@deepseek-ai/dsh-plugin-manager";
import HMR from "@deepseek-ai/dsh-hmr";
import { join as join2 } from "node:path";

// src/host/download.ts
import { createHash, randomUUID as randomUUID3 } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
var LIMIT = 32 * 1024 * 1024;
function verifyArchive(bytes, version) {
  let tar;
  try {
    tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  } catch {
    throw new Error("\u4E0B\u8F7D\u5305\u4E0D\u662F\u6709\u6548\u7684 gzip \u5B89\u88C5\u5305\uFF0C\u8BF7\u68C0\u67E5\u955C\u50CF\u662F\u5426\u8FD4\u56DE\u4E86\u9519\u8BEF\u9875\u9762");
  }
  const files = /* @__PURE__ */ new Map();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    const name2 = header.subarray(0, 100).toString().replace(/\0.*$/s, "");
    if (!name2) break;
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, "").trim(), 8) || 0;
    if (size < 0 || offset + 512 + size > tar.length) throw new Error("\u4E0B\u8F7D\u5305\u635F\u574F");
    files.set(name2, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const entry = [...files.keys()].find((name2) => /^[^/]+\/package\.json$/.test(name2));
  if (!entry) throw new Error("\u4E0B\u8F7D\u5305\u7F3A\u5C11\u63D2\u4EF6\u6E05\u5355\uFF0C\u8BF7\u68C0\u67E5\u955C\u50CF\u4E0B\u8F7D\u5730\u5740");
  const manifest = JSON.parse(files.get(entry).toString());
  const root = entry.slice(0, -"package.json".length);
  if (manifest.name !== "dsh-listener" || manifest.version !== version) throw new Error("\u4E0B\u8F7D\u5305\u4E0E\u76EE\u6807\u63D2\u4EF6\u7248\u672C\u4E0D\u4E00\u81F4");
  for (const file of ["lib/index.js", "lib/client.js", "lib/pcm-worklet.js", "cordis.patch.yml"]) {
    if (!files.get(root + file)?.length) throw new Error(`\u4E0B\u8F7D\u5305\u7F3A\u5C11 ${file}`);
  }
}
async function downloadArchive(url, version, progress, fetcher = fetch, integrity, storageDirectory) {
  if (storageDirectory) await mkdir(storageDirectory, { recursive: true });
  const path = join(storageDirectory ?? tmpdir(), `dsh-listener-${randomUUID3()}.tgz`);
  const file = await open(path, "wx");
  const dispose = () => unlink(path);
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(12e4) });
    if (!response.ok || !response.body) throw new Error(`\u5B89\u88C5\u5305\u4E0B\u8F7D\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
    const length = Number(response.headers.get("content-length"));
    const total = Number.isSafeInteger(length) && length > 0 ? length : void 0;
    if (total && total > LIMIT) {
      await response.body.cancel();
      throw new Error("\u5B89\u88C5\u5305\u8D85\u8FC7 32 MB \u9650\u5236");
    }
    let received = 0;
    progress({ phase: "downloading", received, total });
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > LIMIT) throw new Error("\u5B89\u88C5\u5305\u8D85\u8FC7 32 MB \u9650\u5236");
        await file.writeFile(value);
        progress({ phase: "downloading", received, total });
      }
    } finally {
      await reader.cancel().catch(() => {
      });
      reader.releaseLock();
    }
    await file.close();
    if (total && total !== received) throw new Error("\u5B89\u88C5\u5305\u4E0B\u8F7D\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u8BD5");
    const bytes = await readFile(path);
    if (integrity && `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== integrity) throw new Error("\u5B89\u88C5\u5305\u5B8C\u6574\u6027\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u6216\u66F4\u6362 npm \u4E0B\u8F7D\u6765\u6E90");
    verifyArchive(bytes, version);
    return { path, dispose: storageDirectory ? async () => {
    } : dispose };
  } catch (error) {
    await file.close().catch(() => {
    });
    await dispose().catch(() => {
    });
    throw error;
  }
}

// src/host/management.ts
var REGISTRY = "https://registry.npmjs.org";
var managers = /* @__PURE__ */ new WeakMap();
function managementError(code, diagnostic) {
  if (code === "bundle-in-use") return "\u65E7\u7248\u63D2\u4EF6\u4ECD\u88AB\u5BBF\u4E3B\u52A0\u8F7D\uFF0C\u672C\u6B21\u64CD\u4F5C\u672A\u5B8C\u6210\u3002\u8BF7\u5728 Desktop \u63D2\u4EF6\u7BA1\u7406\u4E2D\u7981\u7528\u8BED\u97F3\u8F93\u5165\uFF0C\u5B8C\u5168\u9000\u51FA\u5E76\u91CD\u5F00 Desktop\uFF0C\u518D\u4ECE Desktop \u63D2\u4EF6\u7BA1\u7406\u5B89\u88C5\u65B0\u7248\u3002";
  if (code === "stop-profile") return "\u5BBF\u4E3B\u65E0\u6CD5\u5728\u8FD0\u884C\u4E2D\u66FF\u6362\u6B64\u63D2\u4EF6\u3002\u8BF7\u505C\u6B62\u5F53\u524D profile\uFF0C\u518D\u4ECE Desktop \u63D2\u4EF6\u7BA1\u7406\u64CD\u4F5C\u3002";
  if (/timeout/i.test(code)) return "\u5B89\u88C5\u8D85\u65F6\u3002\u8BF7\u5728 Desktop \u63D2\u4EF6\u7BA1\u7406\u4E2D\u67E5\u770B\u8BE6\u60C5\u540E\u91CD\u8BD5\u3002";
  if (code === "operation-error" && diagnostic?.includes("ENOENT") && /dsh-listener-[^\s]*\.tgz/.test(diagnostic)) return "\u5B89\u88C5\u5931\u8D25\uFF1A\u5DF2\u4FDD\u5B58\u7684\u63D2\u4EF6\u5B89\u88C5\u5305\u4E0D\u5B58\u5728\u3002\u65E7\u7248\u66F4\u65B0\u6E05\u7406\u4E86 pnpm \u4ECD\u5F15\u7528\u7684\u4E34\u65F6\u6587\u4EF6\uFF0C\u8BF7\u6062\u590D\u539F\u5B89\u88C5\u5305\u540E\u91CD\u8BD5\u3002";
  return `\u63D2\u4EF6\u7BA1\u7406\u64CD\u4F5C\u672A\u5B8C\u6210\uFF08${code}\uFF09\u3002\u8BF7\u5728 Desktop \u63D2\u4EF6\u7BA1\u7406\u4E2D\u67E5\u770B\u8BE6\u60C5\u3002`;
}
function compareVersions(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
function updateUrl(url, source) {
  return source.updateSource === "mirror" ? `${source.mirrorUrl}${new URL(url).pathname}` : url;
}
async function latestRelease(fetcher = fetch, input = {}) {
  const source = validateUpdateSource(input);
  const response = await fetcher(updateUrl(`${REGISTRY}/dsh-listener/latest`, source), {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(3e4)
  });
  if (!response.ok) throw new Error(`npm latest \u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
  const pkg = await response.json();
  if (pkg?.name !== "dsh-listener" || typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error("npm latest \u63D2\u4EF6\u6E05\u5355\u65E0\u6548");
  const tarball = `${REGISTRY}/dsh-listener/-/dsh-listener-${pkg.version}.tgz`;
  if (!pkg.dist?.tarball || ![tarball, updateUrl(tarball, source)].includes(pkg.dist.tarball)) throw new Error("npm \u5B89\u88C5\u5305\u5730\u5740\u65E0\u6548");
  if (!pkg.dist.integrity || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(pkg.dist.integrity)) throw new Error("npm \u5B89\u88C5\u5305\u7F3A\u5C11\u6709\u6548\u7684\u5B8C\u6574\u6027\u6821\u9A8C");
  return { version: pkg.version, tarball: updateUrl(tarball, source), integrity: pkg.dist.integrity };
}
async function manager(ctx) {
  const existing = ctx.get("pluginManager");
  if (existing) {
    await enableProfileReload(ctx);
    return existing;
  }
  if (!ctx.get("profileContext") || !ctx.get("loader")) throw new Error("\u5F53\u524D\u8FD0\u884C\u65B9\u5F0F\u6CA1\u6709\u63D2\u4EF6\u7BA1\u7406\u80FD\u529B\uFF0C\u8BF7\u5728 Desktop \u63D2\u4EF6\u7BA1\u7406\u4E2D\u64CD\u4F5C");
  let pending = managers.get(ctx.root);
  if (!pending) {
    pending = (async () => {
      await enableProfileReload(ctx);
      const fiber = ctx.root.plugin(PluginManager, {});
      await fiber.await();
      const service = ctx.root.get("pluginManager");
      if (!service) throw new Error("\u63D2\u4EF6\u7BA1\u7406\u670D\u52A1\u672A\u5C31\u7EEA");
      return service;
    })();
    managers.set(ctx.root, pending);
    void pending.catch(() => managers.delete(ctx.root));
  }
  return pending;
}
async function enableProfileReload(ctx) {
  if (ctx.get("hmr")) return;
  if (!ctx.get("timer") || !ctx.get("profileContext")) throw new Error("\u5BBF\u4E3B\u7F3A\u5C11\u70ED\u52A0\u8F7D\u670D\u52A1\uFF0C\u8BF7\u5728 Desktop \u63D2\u4EF6\u7BA1\u7406\u4E2D\u64CD\u4F5C");
  const hmr = ctx.root.plugin(HMR, { root: [], debounce: 100, ignored: ["**/node_modules", "**/.*", "cache", "data"] });
  await hmr.await();
}
function mountManagement(ctx, active, fetcher = fetch, getManager = manager, download = downloadArchive, setUpdating = (_value) => {
}) {
  let busy = false;
  let progress = { phase: "idle", received: 0 };
  return ctx.webServer.register({ kind: "exact", path: `${BASE}/manage`, handler: async (req, res) => {
    const reply2 = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    const admission = ctx.connection.admit(req);
    if ("rejection" in admission) {
      reply2(admission.rejection, { error: "Harness \u767B\u5F55\u6216\u9875\u9762\u6765\u6E90\u9A8C\u8BC1\u5931\u8D25" });
      return;
    }
    const query = new URL(req.url ?? "/", "http://localhost").searchParams;
    const action = query.get("action");
    if (req.method === "GET" && action === "progress") {
      reply2(200, progress);
      return;
    }
    if (req.method !== "POST") {
      reply2(405, { error: "\u65B9\u6CD5\u4E0D\u652F\u6301" });
      return;
    }
    if (!["check", "update"].includes(action ?? "")) {
      reply2(400, { error: "\u64CD\u4F5C\u65E0\u6548" });
      return;
    }
    if (busy) {
      reply2(409, { error: "\u5DF2\u6709\u63D2\u4EF6\u7BA1\u7406\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C" });
      return;
    }
    if (active() > 0 && action !== "check") {
      reply2(409, { error: "\u8BF7\u5148\u7ED3\u675F\u5F55\u97F3\uFF0C\u518D\u66F4\u65B0\u63D2\u4EF6" });
      return;
    }
    busy = true;
    if (action === "update") setUpdating(true);
    if (action === "update") progress = { phase: "checking", received: 0 };
    try {
      const source = validateUpdateSource({
        updateSource: query.get("updateSource") ?? "official",
        mirrorUrl: query.get("mirrorUrl") ?? ""
      });
      if (action === "check") {
        const latest2 = await latestRelease(fetcher, source);
        reply2(200, { current: VERSION, latest: latest2.version, available: compareVersions(latest2.version, VERSION) > 0 });
        return;
      }
      const latest = await latestRelease(fetcher, source);
      if (compareVersions(latest.version, VERSION) <= 0) {
        progress = { phase: "done", received: 0 };
        reply2(200, { application: "unchanged", message: "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C" });
        return;
      }
      const service = await getManager(ctx);
      const profile = ctx.get("profileContext");
      if (!profile?.dir) throw new Error("\u65E0\u6CD5\u786E\u5B9A\u63D2\u4EF6\u5B89\u88C5\u5305\u7684\u6301\u4E45\u4FDD\u5B58\u4F4D\u7F6E\uFF0C\u8BF7\u4ECE Desktop \u63D2\u4EF6\u7BA1\u7406\u66F4\u65B0");
      progress = { phase: "downloading", received: 0 };
      const archive = await download(latest.tarball, latest.version, (value) => {
        progress = value;
      }, fetcher, latest.integrity, join2(profile.dir, ".plugin-manager", "archives"));
      let result;
      try {
        if (active() > 0) throw new Error("\u8BF7\u5148\u7ED3\u675F\u5F55\u97F3\uFF0C\u518D\u66F4\u65B0\u63D2\u4EF6");
        progress = { ...progress, phase: "installing" };
        result = await service.installBundle(archive.path);
      } finally {
        await archive.dispose().catch(() => {
        });
      }
      if (result.application === "failed" || result.application === "cancelled" || result.application === "overridden") {
        progress = { ...progress, phase: "error" };
        reply2(400, { error: managementError(result.error?.code ?? result.application, result.error?.diagnostic) });
        return;
      }
      progress = { ...progress, phase: "done" };
      reply2(200, { application: result.application, message: result.application === "restart-required" ? "\u65B0\u7248\u5DF2\u5B89\u88C5\uFF0C\u8BF7\u5B8C\u5168\u9000\u51FA\u5E76\u91CD\u65B0\u6253\u5F00 Desktop\u3002" : "\u66F4\u65B0\u5DF2\u5E94\u7528\uFF1B\u5982\u754C\u9762\u4ECD\u663E\u793A\u65E7\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9875\u9762\u3002" });
    } catch (error) {
      if (action === "update") progress = { ...progress, phase: "error" };
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      const invalidJson = error instanceof SyntaxError;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : void 0;
      reply2(400, { error: timeout ? "npm \u66F4\u65B0\u8FDE\u63A5\u8D85\u65F6\u3002\u8BF7\u68C0\u67E5\u7F51\u7EDC\uFF0C\u6216\u5207\u6362 npm \u955C\u50CF\u540E\u91CD\u8BD5\u3002" : invalidJson ? "\u66F4\u65B0\u670D\u52A1\u672A\u8FD4\u56DE\u6709\u6548 JSON\u3002\u8BF7\u68C0\u67E5\u586B\u5199\u7684\u7F51\u5740\u662F\u5426\u4E3A npm registry\u3002" : code ? managementError(code) : error instanceof Error ? error.message : "\u63D2\u4EF6\u7BA1\u7406\u5931\u8D25" });
    } finally {
      busy = false;
      if (action === "update") setUpdating(false);
    }
  } });
}

// src/index.ts
var name = "dsh-listener";
var inject = ["webServer", "connection", "credentials", "settings"];
var Config = z.object({
  model: z.string().default(defaults.model).volatile(),
  region: z.union(["beijing", "singapore"]).default("beijing").volatile(),
  workspaceId: z.string().default("").volatile(),
  hotkey: z.string().default("AltRight").volatile(),
  mode: z.union(["hold", "toggle"]).default("hold").volatile(),
  autoSend: z.boolean().default(false).volatile(),
  updateSource: z.union(["official", "mirror"]).default("official").volatile(),
  mirrorUrl: z.string().default(defaults.mirrorUrl).volatile()
});
var keyRef = credentialRef("DSH_LISTENER_API_KEY");
function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error("\u8BBE\u7F6E\u8BF7\u6C42\u8FC7\u5927");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function apply(ctx, initial = defaults) {
  let writes = Promise.resolve();
  const descriptor = () => ctx.settings.describe().find((s) => s.ns === name);
  const preferences = () => validatePreferences(descriptor()?.value ?? initial);
  const view = async () => ({
    ...preferences(),
    configured: (await ctx.credentials.describe(keyRef)).configured,
    writable: ctx.settings.writable,
    revision: descriptor()?.revision ?? 0
  });
  ctx.effect(() => ctx.settings.configure({ auto: false }));
  let updating = false;
  const channel = mountHttpChannel(ctx, preferences, keyRef, void 0, () => updating);
  ctx.effect(() => channel.dispose);
  ctx.effect(() => mountManagement(ctx, channel.active, void 0, void 0, void 0, (value) => {
    updating = value;
  }));
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: `${BASE}/config`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req);
    if ("rejection" in admission) {
      json(res, admission.rejection, { error: "\u8BF7\u5148\u767B\u5F55 Harness" });
      return;
    }
    try {
      if (req.method === "GET") {
        json(res, 200, await view());
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { error: "\u65B9\u6CD5\u4E0D\u652F\u6301" });
        return;
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        json(res, 415, { error: "\u9700\u8981 JSON \u8BF7\u6C42" });
        return;
      }
      const request = await body(req);
      const reset = request?.reset === true;
      if (request.reset !== void 0 && typeof request.reset !== "boolean") throw new Error("\u6E05\u9664\u64CD\u4F5C\u65E0\u6548");
      const downloadOnly = request?.updateDownload !== void 0;
      const source = downloadOnly ? validateUpdateSource(request.updateDownload, false) : void 0;
      const next = reset ? defaults : downloadOnly ? void 0 : validatePreferences(request?.preferences);
      if (reset && (downloadOnly || request.apiKey !== void 0 || request.clearKey !== void 0)) throw new Error("\u6E05\u9664\u4E0D\u80FD\u4E0E\u4FDD\u5B58\u540C\u65F6\u8FDB\u884C");
      if (downloadOnly && (request.apiKey !== void 0 || request.clearKey !== void 0)) throw new Error("\u4E0B\u8F7D\u8BBE\u7F6E\u4E0D\u80FD\u4FEE\u6539\u5BC6\u94A5");
      if (!Number.isInteger(request?.revision) || request.revision < 0) throw new Error("\u8BBE\u7F6E\u7248\u672C\u65E0\u6548\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
      if (request.apiKey !== void 0 && (typeof request.apiKey !== "string" || request.apiKey.length > 2048 || !request.apiKey.trim())) throw new Error("API Key \u65E0\u6548");
      if (request.clearKey !== void 0 && typeof request.clearKey !== "boolean") throw new Error("\u5BC6\u94A5\u64CD\u4F5C\u65E0\u6548");
      if (request.apiKey !== void 0 && request.clearKey) throw new Error("\u4E0D\u80FD\u540C\u65F6\u4FDD\u5B58\u548C\u6E05\u9664\u5BC6\u94A5");
      const write = writes.then(async () => {
        if (!ctx.settings.writable) throw new Error("\u5F53\u524D\u914D\u7F6E\u53EA\u8BFB");
        if (request.revision !== descriptor()?.revision) throw new Error("\u8BBE\u7F6E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
        if (reset && channel.active() > 0) throw new Error("\u8BF7\u5148\u7ED3\u675F\u5F55\u97F3");
        if (request.apiKey !== void 0) await ctx.credentials.set(keyRef, request.apiKey.trim());
        if (reset || request.clearKey === true) await ctx.credentials.unset(keyRef);
        await ctx.settings.update(name, downloadOnly ? validatePreferences({ ...preferences(), ...source }) : next, request.revision);
      });
      writes = write.catch(() => void 0);
      await write;
      json(res, 200, await view());
    } catch {
      json(res, 400, { error: "\u4FDD\u5B58\u6216\u8BFB\u53D6\u5931\u8D25\uFF1A\u68C0\u67E5\u914D\u7F6E\u3001\u53EF\u5199\u6743\u9650\uFF0C\u6216\u5237\u65B0\u540E\u91CD\u8BD5\u3002\u5BC6\u94A5\u4E0E\u666E\u901A\u8BBE\u7F6E\u5206\u522B\u4FDD\u5B58\u3002" });
    }
  } }));
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: `${BASE}/pcm-worklet.js`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req);
    if ("rejection" in admission) {
      res.writeHead(admission.rejection);
      res.end();
      return;
    }
    try {
      const source = await readFile2(new URL("./pcm-worklet.js", import.meta.url), "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(source);
    } catch {
      res.writeHead(500);
      res.end("Audio worklet unavailable");
    }
  } }));
}
export {
  Config,
  apply,
  inject,
  name
};
