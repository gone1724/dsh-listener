window.__ModuleLoader__.load({ id: "dsh-speeker", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// src/shared.ts
var BASE = "/dsh-speeker";
var DEFAULT_MODEL = "qwen-audio-3.1-asr-flash-streaming";
var SAMPLE_RATE = 16e3;
var MAX_AUDIO_BYTES = 16e3 * 2 * 120;
var MAX_BUFFER_BYTES = 16e3 * 2 * 15;
var VERSION = "0.3.2";
var defaults = {
  model: DEFAULT_MODEL,
  region: "beijing",
  workspaceId: "",
  hotkey: "AltRight",
  mode: "hold",
  autoSend: false,
  updateSource: "official",
  mirrorUrl: ""
};
function validateUpdateSource(input) {
  const updateSource = input.updateSource ?? "official";
  if (updateSource !== "official" && updateSource !== "mirror") throw new Error("\u66F4\u65B0\u4E0B\u8F7D\u6765\u6E90\u65E0\u6548");
  if (input.mirrorUrl !== void 0 && typeof input.mirrorUrl !== "string") throw new Error("\u955C\u50CF\u7F51\u5740\u65E0\u6548");
  const mirrorUrl = (input.mirrorUrl ?? "").trim();
  if (mirrorUrl) {
    try {
      const url = new URL(mirrorUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || mirrorUrl.length > 512) throw new Error();
    } catch {
      throw new Error("\u955C\u50CF\u7F51\u5740\u987B\u4E3A HTTPS \u524D\u7F00\uFF0C\u4E0D\u5305\u542B\u8D26\u53F7\u3001\u67E5\u8BE2\u53C2\u6570\u6216\u5B8C\u6574 GitHub \u4E0B\u8F7D\u94FE\u63A5");
    }
  }
  if (updateSource === "mirror" && !mirrorUrl) throw new Error("\u8BF7\u5148\u586B\u5199 GitHub \u955C\u50CF\u7F51\u5740");
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
  const source = validateUpdateSource({ updateSource: p.updateSource, mirrorUrl: p.mirrorUrl });
  return { model: p.model, region: p.region, workspaceId: p.workspaceId, hotkey: p.hotkey, mode: p.mode, autoSend: p.autoSend, ...source };
}
function workspaceFromHost(value) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["https:", "wss:"].includes(url.protocol) || url.username || url.password || url.port) return;
    const match = /^([a-zA-Z0-9-]{1,64})\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.exec(url.hostname);
    if (match) return { workspaceId: match[1], region: match[2] === "cn-beijing" ? "beijing" : "singapore" };
  } catch {
  }
}
function joinText(left, right) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return left + right;
  return left + (/[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right) ? " " : "") + right;
}

// src/client/settings.ts
var snapshot = null;
var listeners = /* @__PURE__ */ new Set();
function publish(value) {
  snapshot = value;
  for (const fn of listeners) fn();
}
async function request(options) {
  const response = await fetch(`${BASE}/config`, { credentials: "same-origin", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "\u65E0\u6CD5\u8BFB\u53D6\u8BED\u97F3\u8BBE\u7F6E");
  publish(result);
  return result;
}
var settings = {
  getSnapshot: () => snapshot,
  subscribe: (fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  refresh: () => request(),
  progress: async (signal) => {
    const response = await fetch(`${BASE}/manage?action=progress`, { credentials: "same-origin", signal });
    if (!response.ok) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u66F4\u65B0\u8FDB\u5EA6");
    return response.json();
  },
  manage: async (action, source) => {
    const query = new URLSearchParams({ action, ...action === "uninstall" ? {} : validateUpdateSource(source ?? {}) });
    const response = await fetch(`${BASE}/manage?${query}`, { method: "POST", credentials: "same-origin" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "\u63D2\u4EF6\u7BA1\u7406\u5931\u8D25");
    return result;
  },
  save: (preferences, revision, apiKey, clearKey) => request({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences, revision, ...apiKey ? { apiKey } : {}, ...clearKey ? { clearKey: true } : {} })
  })
};

// src/client/hotkey.ts
function keyBinding(e) {
  const modifiers = [];
  if (e.ctrlKey && !e.code.startsWith("Control")) modifiers.push("Control");
  if (e.shiftKey && !e.code.startsWith("Shift")) modifiers.push("Shift");
  if (e.altKey && !e.code.startsWith("Alt")) modifiers.push("Alt");
  if (e.metaKey && !e.code.startsWith("Meta")) modifiers.push("Meta");
  return [...modifiers, e.code].join("+");
}
function matches(e, binding, allowRepeat = false) {
  return (allowRepeat || !e.repeat) && !e.isComposing && !e.getModifierState("AltGraph") && keyBinding(e) === binding;
}
var modifierCode = /^(Control|Shift|Alt|Meta)(Left|Right)$/;
var HotkeyCapture = class {
  candidate = "";
  down(e) {
    if (e.repeat || e.isComposing || e.getModifierState("AltGraph")) {
      this.candidate = "";
      return;
    }
    this.candidate = keyBinding(e);
    if (!modifierCode.test(e.code)) {
      const binding = this.candidate;
      this.candidate = "";
      return binding;
    }
  }
  up(e) {
    if (!this.candidate || !releasesBinding(e.code, this.candidate)) return;
    const binding = this.candidate;
    this.candidate = "";
    return binding;
  }
};
function releasesBinding(code, binding) {
  const parts = binding.split("+");
  return parts.at(-1) === code || modifierCode.test(code) && parts.slice(0, -1).includes(code.replace(/(Left|Right)$/, ""));
}
var HotkeyGesture = class {
  constructor(action, mode) {
    this.action = action;
    this.mode = mode;
  }
  pressed = false;
  pressedMode = "hold";
  down() {
    if (this.pressed) return;
    this.pressed = true;
    this.pressedMode = this.mode();
    if (this.action.active()) {
      if (this.pressedMode === "toggle") this.action.finish();
    } else this.action.start();
  }
  up() {
    if (!this.pressed) return;
    this.pressed = false;
    if (this.pressedMode === "hold" && this.action.active()) this.action.finish();
  }
  reset() {
    this.pressed = false;
  }
};

// src/client/draft.ts
function appendTranscript(actions, current, text, autoSend, startRevision) {
  if (!text.trim()) return "empty";
  if (current.phase !== "plain") return "blocked";
  const end = current.draft.length - current.occurrences.reduce((delta, chip) => delta + chip.length - 1, 0);
  const suffix = joinText(current.draft, text.trim()).slice(current.draft.length);
  if (!actions.insertText(suffix, { start: end, end, draftRev: current.draftRev })) return "blocked";
  if (autoSend && startRevision === current.draftRev) {
    actions.submit();
    return "sent";
  }
  return autoSend ? "edited" : "appended";
}

// src/client/audio.ts
var Recording = class {
  constructor(chunk, interrupted) {
    this.chunk = chunk;
    this.interrupted = interrupted;
  }
  stream;
  context;
  source;
  node;
  cancelled = false;
  stopped = false;
  stopping;
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("\u9EA6\u514B\u98CE\u9700\u8981 localhost \u6216 HTTPS\uFF0C\u4EE5\u53CA\u652F\u6301 Web Audio \u7684\u6D4F\u89C8\u5668");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    if (this.cancelled) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("\u5F55\u97F3\u5DF2\u53D6\u6D88");
    }
    this.stream = stream;
    try {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (this.context.sampleRate !== SAMPLE_RATE) throw new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301 16 kHz \u97F3\u9891\u91C7\u96C6");
      await this.context.audioWorklet.addModule(`${BASE}/pcm-worklet.js`);
      if (this.cancelled) throw new Error("\u5F55\u97F3\u5DF2\u53D6\u6D88");
      this.node = new AudioWorkletNode(this.context, "dsh-speeker-pcm");
      this.node.port.onmessage = (event) => {
        if (!this.cancelled && event.data instanceof ArrayBuffer) this.chunk(event.data);
      };
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.node);
      this.node.connect(this.context.destination);
      for (const track of stream.getTracks()) track.onended = () => {
        if (!this.cancelled && !this.stopped) this.interrupted();
      };
      await this.context.resume();
      if (this.cancelled) throw new Error("\u5F55\u97F3\u5DF2\u53D6\u6D88");
    } catch (error) {
      await this.cancel();
      throw error;
    }
  }
  stop() {
    if (this.stopping) return this.stopping;
    this.stopping = this.finish();
    return this.stopping;
  }
  async finish() {
    this.stopped = true;
    const node = this.node;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    try {
      if (!node || this.cancelled) return;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("\u97F3\u9891\u6536\u5C3E\u8D85\u65F6")), 1500);
        node.port.onmessage = (event) => {
          if (this.cancelled) {
            clearTimeout(timer);
            resolve();
            return;
          }
          if (event.data instanceof ArrayBuffer) this.chunk(event.data);
          else if (event.data?.stopped) {
            clearTimeout(timer);
            resolve();
          }
        };
        node.port.postMessage("stop");
      });
    } finally {
      await this.release();
    }
  }
  async cancel() {
    this.cancelled = true;
    await this.release();
  }
  async release() {
    this.source?.disconnect();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    const context = this.context;
    this.context = void 0;
    if (context && context.state !== "closed") await context.close().catch(() => void 0);
  }
};

// src/client/channel.ts
var HttpVoiceChannel = class {
  static OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  onmessage = null;
  onerror = null;
  onclose = null;
  id = "";
  abort = new AbortController();
  startup;
  uploads;
  constructor(_url) {
    this.startup = this.start();
    this.uploads = this.startup;
    void this.startup.catch((error) => this.fail(error));
  }
  async request(action, options = {}, timeout = 15e3) {
    const query = new URLSearchParams({ action, ...this.id ? { id: this.id } : {} });
    const response = await fetch(`${BASE}/channel?${query}`, {
      credentials: "same-origin",
      ...options,
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(timeout)])
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Harness \u8BED\u97F3\u63A5\u53E3 HTTP ${response.status}\uFF1A${result.error ?? "\u8BF7\u6C42\u5931\u8D25"}`);
    return result;
  }
  async start() {
    const result = await this.request("start", { method: "POST" });
    if (typeof result.id !== "string") throw new Error("\u5F55\u97F3\u4F1A\u8BDD\u54CD\u5E94\u65E0\u6548");
    this.id = result.id;
    if (this.readyState !== 1) {
      this.cancelRemote();
      return;
    }
    void this.poll().catch((error) => this.fail(error));
  }
  async poll() {
    let after = 0;
    while (this.readyState === 1) {
      const query = new URLSearchParams({ action: "events", id: this.id, after: String(after) });
      const response = await fetch(`${BASE}/channel?${query}`, { credentials: "same-origin", signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(2e4)]) });
      const result = await response.json();
      if (!response.ok) throw new Error(`Harness \u4E8B\u4EF6\u63A5\u53E3 HTTP ${response.status}\uFF1A${result.error ?? "\u8BF7\u6C42\u5931\u8D25"}`);
      if (this.readyState !== 1) return;
      if (!Array.isArray(result.events)) throw new Error("\u8BED\u97F3\u4E8B\u4EF6\u54CD\u5E94\u65E0\u6548");
      for (const item of result.events) {
        if (!Number.isSafeInteger(item.seq) || item.seq <= after) throw new Error("\u8BED\u97F3\u4E8B\u4EF6\u987A\u5E8F\u65E0\u6548");
        after = item.seq;
        this.onmessage?.({ data: JSON.stringify(item.event) });
        if (this.readyState !== 1) return;
      }
      if (result.ended) {
        this.readyState = 3;
        this.onclose?.();
        return;
      }
    }
  }
  send(data) {
    if (this.readyState !== 1) return;
    if (typeof data === "string" && JSON.parse(data).type === "cancel") {
      this.close();
      return;
    }
    const bytes = typeof data === "string" ? 0 : data.byteLength;
    this.bufferedAmount += bytes;
    if (this.bufferedAmount > MAX_BUFFER_BYTES) {
      this.fail(new Error("\u97F3\u9891\u4E0A\u4F20\u7F51\u7EDC\u8FC7\u6162\uFF0C\u5DF2\u53D6\u6D88"));
      return;
    }
    this.uploads = this.uploads.then(async () => {
      if (this.readyState !== 1) return;
      if (typeof data === "string") await this.request("finish", { method: "POST" });
      else await this.request("audio", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: data });
    }).catch((error) => this.fail(error)).finally(() => {
      this.bufferedAmount -= bytes;
    });
  }
  fail(error) {
    if (this.readyState !== 1) return;
    this.onmessage?.({ data: JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Harness HTTP \u8BED\u97F3\u8FDE\u63A5\u5931\u8D25" }) });
    this.close();
  }
  cancelRemote() {
    if (!this.id) return;
    void fetch(`${BASE}/channel?action=cancel&id=${encodeURIComponent(this.id)}`, { method: "POST", credentials: "same-origin", keepalive: true, signal: AbortSignal.timeout(3e3) }).catch(() => void 0);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.abort.abort();
    this.cancelRemote();
  }
};

// src/client/session.ts
var VoiceSession = class {
  constructor(final) {
    this.final = final;
  }
  state = { phase: "idle", preview: "", message: "" };
  listeners = /* @__PURE__ */ new Set();
  generation = 0;
  capture;
  socket;
  ready = false;
  queue = [];
  queuedBytes = 0;
  totalBytes = 0;
  finishing = false;
  finishSent = false;
  timer;
  limit;
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  active = () => ["requesting", "recording"].includes(this.state.phase);
  busy = () => this.active() || this.state.phase === "finishing";
  set(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async start() {
    if (this.busy()) return;
    const run = ++this.generation;
    this.ready = false;
    this.finishing = false;
    this.finishSent = false;
    this.queue = [];
    this.queuedBytes = 0;
    this.totalBytes = 0;
    this.set({ phase: "requesting", preview: "", message: "\u6B63\u5728\u8BF7\u6C42\u9EA6\u514B\u98CE\u2026" });
    const fail = (message) => {
      if (this.generation === run) this.fail(message);
    };
    const capture = new Recording((chunk) => {
      if (this.generation === run) this.audio(chunk);
    }, () => fail("\u9EA6\u514B\u98CE\u4E2D\u65AD\uFF0C\u5F55\u97F3\u5DF2\u53D6\u6D88"));
    this.capture = capture;
    try {
      const socket = new HttpVoiceChannel();
      this.socket = socket;
      this.timer = setTimeout(() => fail("\u8FDE\u63A5\u6216\u9EA6\u514B\u98CE\u6388\u6743\u8D85\u65F6\uFF0C\u5DF2\u53D6\u6D88"), 15e3);
      socket.onmessage = (event) => {
        if (this.generation !== run) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "ready") {
            this.ready = true;
            for (const chunk of this.queue) socket.send(chunk);
            this.queue = [];
            this.queuedBytes = 0;
            this.flushFinish();
          } else if (message.type === "partial") {
            if (typeof message.text !== "string") throw new Error("Invalid transcript");
            this.set({ preview: message.text });
          } else if (message.type === "final") {
            if (!this.finishSent || typeof message.text !== "string") throw new Error("Unexpected final");
            const text = message.text;
            this.cancel();
            if (text.trim()) this.final(text);
          } else if (message.type === "error") fail(typeof message.message === "string" ? message.message : "\u8BC6\u522B\u5931\u8D25");
          else throw new Error("Unknown voice event");
        } catch {
          fail("\u8BED\u97F3\u670D\u52A1\u54CD\u5E94\u65E0\u6548");
        }
      };
      let diagnosing = false;
      socket.onerror = () => {
        diagnosing = true;
        void fetch(`${BASE}/config`, { credentials: "same-origin", signal: AbortSignal.timeout(3e3) }).then((response) => {
          if (response.status === 401) fail("Harness \u767B\u5F55\u5DF2\u5931\u6548\uFF08HTTP 401\uFF09\uFF0C\u8BF7\u5173\u95ED\u5E76\u91CD\u65B0\u6253\u5F00 Desktop \u9875\u9762\u3002");
          else if (response.status === 403) fail("Harness \u62D2\u7EDD\u5F53\u524D\u9875\u9762\u6765\u6E90\uFF08HTTP 403\uFF09\uFF0C\u8BF7\u4ECE Desktop \u81EA\u5E26\u9875\u9762\u6253\u5F00\u3002");
          else if (response.ok) fail("\u8BED\u97F3\u8BBE\u7F6E\u63A5\u53E3\u6B63\u5E38\uFF0C\u4F46 Harness \u97F3\u9891\u4E0A\u4F20\u901A\u9053\u4E0D\u53EF\u7528\u3002\u8BF7\u66F4\u65B0\u63D2\u4EF6\u5E76\u91CD\u65B0\u6253\u5F00 Desktop \u9875\u9762\u3002");
          else fail(`Harness \u8BED\u97F3\u63A5\u53E3\u4E0D\u53EF\u7528\uFF08HTTP ${response.status}\uFF09\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u662F\u5426\u542F\u7528\u5E76\u91CD\u542F Desktop\u3002`);
        }).catch(() => fail("\u65E0\u6CD5\u8BBF\u95EE Harness \u672C\u5730\u8BED\u97F3\u63A5\u53E3\uFF0C\u8BF7\u68C0\u67E5 Desktop \u5185\u6838\u662F\u5426\u8FD0\u884C\uFF0C\u5E76\u91CD\u542F Desktop\u3002"));
      };
      socket.onclose = () => {
        if (!diagnosing) fail("\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u5F55\u97F3\u5DF2\u53D6\u6D88");
      };
      await capture.start();
      if (this.generation !== run) {
        await capture.cancel();
        return;
      }
      this.set({ phase: "recording", message: "" });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.ready) fail("\u767E\u70BC\u8FDE\u63A5\u8D85\u65F6");
      }, 15e3);
      this.limit = setTimeout(() => {
        void this.finish();
      }, 12e4);
    } catch (error) {
      fail(error instanceof Error ? error.message : "\u65E0\u6CD5\u5F00\u542F\u9EA6\u514B\u98CE");
    }
  }
  async finish() {
    if (this.state.phase === "requesting") {
      this.cancel("\u9EA6\u514B\u98CE\u5C1A\u672A\u5C31\u7EEA\uFF0C\u672C\u6B21\u5F55\u97F3\u5DF2\u53D6\u6D88");
      return;
    }
    if (this.state.phase !== "recording") return;
    const run = this.generation;
    this.set({ phase: "finishing", message: "\u6B63\u5728\u8BC6\u522B\u2026" });
    clearTimeout(this.limit);
    try {
      await this.capture?.stop();
      if (this.generation !== run) return;
      this.finishing = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.fail("\u7B49\u5F85\u8BC6\u522B\u7ED3\u679C\u8D85\u65F6"), 2e4);
      if (!this.totalBytes) {
        this.cancel();
        return;
      }
      this.flushFinish();
    } catch (error) {
      if (this.generation === run) this.fail(error instanceof Error ? error.message : "\u505C\u6B62\u5F55\u97F3\u5931\u8D25");
    }
  }
  cancel(message = "") {
    ++this.generation;
    clearTimeout(this.timer);
    clearTimeout(this.limit);
    void this.capture?.cancel();
    this.capture = void 0;
    const socket = this.socket;
    this.socket = void 0;
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState === 1) socket.send(JSON.stringify({ type: "cancel" }));
      socket.close();
    }
    this.queue = [];
    this.queuedBytes = 0;
    this.set({ phase: "idle", preview: "", message });
  }
  fail(message) {
    this.cancel();
    this.set({ phase: "error", message });
  }
  audio(chunk) {
    const remaining = MAX_AUDIO_BYTES - this.totalBytes;
    if (remaining <= 0) {
      if (this.state.phase === "recording") void this.finish();
      return;
    }
    if (chunk.byteLength > remaining) chunk = chunk.slice(0, remaining);
    this.totalBytes += chunk.byteLength;
    if (this.ready && this.socket?.readyState === 1) {
      if (this.socket.bufferedAmount > MAX_BUFFER_BYTES) {
        this.fail("\u4E0A\u4F20\u7F51\u7EDC\u8FC7\u6162\uFF0C\u5DF2\u53D6\u6D88");
        return;
      }
      this.socket.send(chunk);
    } else {
      this.queuedBytes += chunk.byteLength;
      if (this.queuedBytes > MAX_BUFFER_BYTES) {
        this.fail("\u767E\u70BC\u8FDE\u63A5\u8FC7\u6162\uFF0C\u5DF2\u53D6\u6D88");
        return;
      }
      this.queue.push(chunk);
    }
    if (this.totalBytes === MAX_AUDIO_BYTES && this.state.phase === "recording") void this.finish();
  }
  flushFinish() {
    if (this.finishing && this.ready && !this.finishSent && this.socket?.readyState === 1) {
      this.finishSent = true;
      this.socket.send(JSON.stringify({ type: "finish" }));
    }
  }
};

// src/client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots"];
var sessions = /* @__PURE__ */ new Set();
var owner;
var style = `
.speeker-button{border:0;border-radius:8px;padding:7px;display:inline-flex;align-items:center;gap:5px;color:#858585;background:transparent;cursor:pointer;font:inherit}
.speeker-button:hover{background:var(--dsw-alias-bg-layer-2,#8882)}.speeker-button:disabled{opacity:.5;cursor:default}
.speeker-button[data-recording=true]{color:#16a34a;background:#16a34a18}.speeker-button:focus-visible,.speeker-settings input:focus-visible,.speeker-settings select:focus-visible{outline:2px solid #16a34a;outline-offset:2px}
.speeker-control{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.speeker-status{font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.speeker-settings{max-width:480px;padding:12px;color:inherit;font:inherit;font-size:13px}.speeker-settings h2{margin:0 0 6px;font-size:16px}.speeker-settings p{line-height:1.5;opacity:.8;margin:8px 0}.speeker-settings details{margin:10px 0;font-size:12px;opacity:.85}
.speeker-field{display:grid;grid-template-columns:135px 1fr;gap:12px;align-items:center;margin:16px 0}.speeker-field input:not([type=checkbox]),.speeker-field select{box-sizing:border-box;width:100%;padding:9px 10px;color:inherit;background:var(--dsw-alias-bg-layer-2,#8881);border:1px solid #8885;border-radius:7px;font:inherit}.speeker-field input[type=checkbox]{width:18px;height:18px;accent-color:#16a34a}
.speeker-actions{display:flex;gap:10px;margin-top:20px}.speeker-action{padding:8px 14px;border:1px solid #8885;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit}.speeker-primary{background:#15803d;color:white;border-color:#15803d}.speeker-action:disabled{opacity:.5;cursor:default}
.speeker-dialog{padding:0;border:1px solid #8885;border-radius:12px;max-width:min(680px,calc(100vw - 32px));max-height:85vh;color:inherit;background:var(--dsw-alias-bg-layer-1,Canvas);overflow:auto}.speeker-dialog::backdrop{background:#0006}.speeker-dialog-close{display:flex;justify-content:flex-end;padding:12px 16px 0}
.speeker-settings .speeker-field{grid-template-columns:105px 1fr;gap:8px;margin:10px 0}.speeker-settings .speeker-field input:not([type=checkbox]),.speeker-settings .speeker-field select{padding:6px 8px;font-size:13px}.speeker-settings .speeker-action{padding:5px 10px;font-size:13px}.speeker-settings .speeker-actions{margin-top:12px}.speeker-popup{width:min(380px,calc(100vw - 48px));padding:16px;font-size:13px}.speeker-popup h2{font-size:16px;margin:0 0 10px}.speeker-popup p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}.speeker-popup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.speeker-progress{width:100%;height:8px;accent-color:#16a34a}
@media(max-width:500px){.speeker-field{grid-template-columns:1fr;gap:6px}.speeker-settings{padding:12px}}
`;
function Mic() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" })
  ] });
}
function VoiceButton({ sessionId, useInput, inputActions }) {
  const input = useInput((value) => value);
  const config = (0, import_react.useSyncExternalStore)(settings.subscribe, settings.getSnapshot);
  const latest = (0, import_react.useRef)({ input, config, inputActions });
  latest.current = { input, config, inputActions };
  const start = (0, import_react.useRef)({ revision: 0, autoSend: false });
  const [notice, setNotice] = (0, import_react.useState)("");
  const [pending, setPending] = (0, import_react.useState)("");
  const [showSettings, setShowSettings] = (0, import_react.useState)(false);
  const button = (0, import_react.useRef)(null);
  const [session] = (0, import_react.useState)(() => new VoiceSession((text) => {
    if (owner === session) owner = void 0;
    const { input: input2, inputActions: inputActions2 } = latest.current;
    const result = appendTranscript(inputActions2, input2, text, start.current.autoSend, start.current.revision);
    if (result === "blocked") {
      setPending(text);
      setNotice("\u8F93\u5165\u6846\u6682\u4E0D\u53EF\u7F16\u8F91\uFF0C\u8BC6\u522B\u6587\u5B57\u5DF2\u4FDD\u7559");
    } else if (result === "empty") setNotice("");
    else if (result === "edited") setNotice("\u8349\u7A3F\u5DF2\u7F16\u8F91\uFF0C\u8BED\u97F3\u5DF2\u8FFD\u52A0\uFF0C\u8BF7\u624B\u52A8\u53D1\u9001");
    else setNotice(result === "sent" ? "\u5DF2\u63D0\u4EA4\u53D1\u9001" : "\u8BED\u97F3\u5DF2\u8FFD\u52A0");
  }));
  const state = (0, import_react.useSyncExternalStore)(session.subscribe, session.getSnapshot);
  (0, import_react.useEffect)(() => {
    if (state.phase === "error") setNotice(state.message);
  }, [state.phase, state.message]);
  const operations = (0, import_react.useRef)({ begin: () => {
  }, finish: () => {
  } });
  operations.current = {
    begin: () => {
      const { config: config2, input: input2 } = latest.current;
      if (!config2?.configured || input2.phase !== "plain" || owner && owner !== session && owner.busy() || session.busy()) return;
      start.current = { revision: input2.draftRev, autoSend: config2.autoSend };
      setNotice("");
      setPending("");
      owner = session;
      void session.start();
    },
    finish: () => {
      void session.finish();
    }
  };
  (0, import_react.useEffect)(() => {
    sessions.add(session);
    const gesture = new HotkeyGesture({ start: () => operations.current.begin(), finish: () => operations.current.finish(), active: session.active }, () => latest.current.config?.mode ?? "hold");
    let pressedCode = "";
    const down = (event) => {
      if (event.key === "Escape" && owner === session && session.busy()) {
        session.cancel("\u5DF2\u53D6\u6D88\u5F55\u97F3");
        gesture.reset();
        pressedCode = "";
        event.preventDefault();
        return;
      }
      if (event.defaultPrevented || !document.hasFocus() || document.hidden || !button.current?.getClientRects().length) return;
      if (event.target?.closest?.('[data-speeker-settings], [role="dialog"]')) return;
      if (!latest.current.config?.configured || !matches(event, latest.current.config.hotkey, true)) return;
      if (owner && owner !== session && owner.busy()) return;
      event.preventDefault();
      if (event.repeat) return;
      pressedCode = latest.current.config.hotkey;
      gesture.down();
    };
    const up = (event) => {
      if (!pressedCode || !releasesBinding(event.code, pressedCode)) return;
      event.preventDefault();
      pressedCode = "";
      gesture.up();
    };
    const cancel = () => {
      gesture.reset();
      pressedCode = "";
      if (session.busy()) session.cancel("\u9875\u9762\u5931\u53BB\u7126\u70B9\uFF0C\u5DF2\u53D6\u6D88\u5F55\u97F3");
      if (owner === session) owner = void 0;
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      session.cancel();
      sessions.delete(session);
      if (owner === session) owner = void 0;
    };
  }, [sessionId, session]);
  const label = state.phase === "recording" ? "\u505C\u6B62\u5F55\u97F3" : state.phase === "requesting" ? "\u53D6\u6D88\u9EA6\u514B\u98CE\u8BF7\u6C42" : state.phase === "finishing" ? "\u6B63\u5728\u8BC6\u522B" : "\u5F00\u59CB\u8BED\u97F3\u8F93\u5165";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "speeker-control", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        ref: button,
        type: "button",
        className: "speeker-button",
        "aria-label": label,
        "aria-pressed": session.active(),
        "data-recording": state.phase === "recording",
        title: config?.configured ? `${label}\uFF08${config.hotkey}\uFF09${state.preview ? `\uFF1A${state.preview}` : ""}\uFF1B\u53F3\u952E\u6253\u5F00\u8BED\u97F3\u8F93\u5165\u8BBE\u7F6E` : "\u70B9\u51FB\u914D\u7F6E\u8BED\u97F3\u8F93\u5165",
        disabled: state.phase === "finishing" || input.phase !== "plain",
        onContextMenu: (event) => {
          event.preventDefault();
          if (!session.busy()) setShowSettings(true);
        },
        onClick: () => {
          if (!config?.configured) setShowSettings(true);
          else if (session.active()) operations.current.finish();
          else operations.current.begin();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, {})
      }
    ),
    showSettings && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsDialog, { onClose: () => setShowSettings(false) }),
    notice && !["\u8BED\u97F3\u5DF2\u8FFD\u52A0", "\u5DF2\u63D0\u4EA4\u53D1\u9001"].includes(notice) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageDialog, { message: notice, onClose: () => setNotice(""), onSettings: () => {
      setNotice("");
      setShowSettings(true);
    }, children: pending && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: pending }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "speeker-action", type: "button", onClick: () => {
        const result = appendTranscript(inputActions, latest.current.input, pending, false, 0);
        if (result !== "blocked") {
          setPending("");
          setNotice("\u8BED\u97F3\u5DF2\u8FFD\u52A0");
        }
      }, children: "\u8FFD\u52A0\u8BC6\u522B\u6587\u5B57" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "speeker-action", type: "button", onClick: () => {
        void (navigator.clipboard?.writeText(pending) ?? Promise.reject()).then(() => setNotice("\u5DF2\u590D\u5236\u8BC6\u522B\u6587\u5B57")).catch(() => setNotice("\u65E0\u6CD5\u590D\u5236\uFF0C\u8BF7\u4F7F\u7528\u8FFD\u52A0\u6309\u94AE"));
      }, children: "\u590D\u5236" })
    ] }) })
  ] });
}
function MessageDialog({ message, onClose, onSettings, children }) {
  const dialog = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    dialog.current?.showModal();
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dialog", { ref: dialog, className: "speeker-dialog speeker-popup", "aria-label": "\u8BED\u97F3\u8F93\u5165\u63D0\u793A", onCancel: onClose, onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u8BED\u97F3\u8F93\u5165" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: message }),
    children,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "speeker-popup-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "speeker-action", onClick: onSettings, children: "\u68C0\u67E5\u8BBE\u7F6E" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "speeker-action", onClick: onClose, children: "\u5173\u95ED" })
    ] })
  ] });
}
function SettingsDialog({ onClose }) {
  const dialog = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    dialog.current?.showModal();
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dialog", { ref: dialog, className: "speeker-dialog", "aria-label": "\u8BED\u97F3\u8F93\u5165\u8BBE\u7F6E", onCancel: onClose, onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "speeker-dialog-close", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "speeker-action", onClick: onClose, children: "\u5173\u95ED" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VoiceSettings, {})
  ] });
}
function VoiceSettings() {
  const saved = (0, import_react.useSyncExternalStore)(settings.subscribe, settings.getSnapshot);
  const [form, setForm] = (0, import_react.useState)(defaults);
  const [key, setKey] = (0, import_react.useState)("");
  const [clearKey, setClearKey] = (0, import_react.useState)(false);
  const [capture, setCapture] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)("");
  const [error, setError] = (0, import_react.useState)("");
  const [available, setAvailable] = (0, import_react.useState)(false);
  const [latestVersion, setLatestVersion] = (0, import_react.useState)("");
  const [managementMessage, setManagementMessage] = (0, import_react.useState)("");
  const [updating, setUpdating] = (0, import_react.useState)(false);
  const [progress, setProgress] = (0, import_react.useState)(null);
  const dirty = (0, import_react.useRef)(false);
  const [revision, setRevision] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    void settings.refresh().catch((error2) => setError(error2.message));
  }, []);
  (0, import_react.useEffect)(() => {
    if (saved && !dirty.current) {
      setForm(saved);
      setRevision(saved.revision);
    }
  }, [saved]);
  (0, import_react.useEffect)(() => {
    if (!updating) return;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const value = await settings.progress(AbortSignal.any([controller.signal, AbortSignal.timeout(5e3)]));
        if (!controller.signal.aborted) setProgress(value);
      } catch {
      }
      if (!controller.signal.aborted) timer = setTimeout(() => {
        void poll();
      }, 700);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [updating]);
  (0, import_react.useEffect)(() => {
    if (!capture) return;
    const recorder = new HotkeyCapture();
    const choose = (binding) => {
      try {
        validatePreferences({ ...defaults, hotkey: binding });
      } catch {
        setMessage("\u8BF7\u9009\u62E9\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u7A7A\u683C\u3001F1\u2013F12 \u6216\u4FEE\u9970\u952E\u7EC4\u5408");
        return;
      }
      dirty.current = true;
      setForm((p) => ({ ...p, hotkey: binding }));
      setCapture(false);
      setMessage("\u5FEB\u6377\u952E\u5DF2\u9009\u62E9\uFF0C\u70B9\u51FB\u4FDD\u5B58\u751F\u6548");
    };
    const keydown = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        setCapture(false);
        return;
      }
      if (event.repeat || event.isComposing) return;
      const binding = recorder.down(event);
      if (event.getModifierState("AltGraph")) {
        setMessage("AltGr \u7528\u4E8E\u5B57\u7B26\u8F93\u5165\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u5FEB\u6377\u952E");
        return;
      }
      if (binding) choose(binding);
    };
    const keyup = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const binding = recorder.up(event);
      if (binding) choose(binding);
    };
    const blur = () => setCapture(false);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
    };
  }, [capture]);
  const update = (key2, value) => {
    dirty.current = true;
    setForm((p) => ({ ...p, [key2]: value }));
  };
  const manage = (action) => {
    setProgress(action === "update" ? { phase: "checking", received: 0 } : null);
    setUpdating(action === "update");
    setBusy(true);
    setManagementMessage(action === "check" ? "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026" : action === "update" ? "\u6B63\u5728\u4E0B\u8F7D\u5E76\u5B89\u88C5\u65B0\u7248\uFF0C\u8BF7\u7B49\u5F85\u2026" : "\u6B63\u5728\u5378\u8F7D\u63D2\u4EF6\u2026");
    void settings.manage(action, form).then((result) => {
      if (action === "check") {
        setAvailable(!!result.available);
        setLatestVersion(result.latest ?? "");
        setManagementMessage(result.available ? `\u53D1\u73B0\u65B0\u7248 ${result.latest}` : "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C");
      } else {
        setManagementMessage(result.message ?? "\u64CD\u4F5C\u5DF2\u5B8C\u6210");
        setAvailable(false);
        if (action === "update") setProgress((p) => ({ ...p, received: p?.received ?? 0, phase: "done" }));
      }
    }).catch((error2) => {
      setManagementMessage("");
      setProgress(null);
      setError(error2.message);
    }).finally(() => {
      setBusy(false);
      setUpdating(false);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "speeker-settings", "data-speeker-settings": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u8BED\u97F3\u8F93\u5165" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u963F\u91CC\u4E91\u767E\u70BC \xB7 \u5B9E\u65F6\u8BC6\u522B\u5E76\u8FFD\u52A0\u5230\u8349\u7A3F" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "API Key" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "password", autoComplete: "off", value: key, placeholder: saved?.configured ? "\u5DF2\u914D\u7F6E\uFF1B\u7559\u7A7A\u4FDD\u7559\u539F\u5BC6\u94A5" : "\u8F93\u5165\u767E\u70BC API Key", onChange: (e) => {
        setKey(e.target.value);
        setClearKey(false);
      } })
    ] }),
    saved?.configured && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6E05\u9664\u5DF2\u4FDD\u5B58\u5BC6\u94A5" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: clearKey, onChange: (e) => {
        setClearKey(e.target.checked);
        if (e.target.checked) setKey("");
      } })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5730\u57DF" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: form.region, onChange: (e) => update("region", e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "beijing", children: "\u5317\u4EAC" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "singapore", children: "\u65B0\u52A0\u5761" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Workspace ID" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: form.workspaceId, placeholder: "\u7A7A\u95F4 ID\uFF0C\u6216\u7C98\u8D34\u5B8C\u6574 API Host", onChange: (e) => {
        const value = e.target.value.trim(), workspace = workspaceFromHost(value);
        if (workspace) {
          dirty.current = true;
          setForm((p) => ({ ...p, ...workspace }));
          setMessage("\u5DF2\u4ECE API Host \u63D0\u53D6\u7A7A\u95F4 ID \u548C\u5730\u57DF\uFF0C\u70B9\u51FB\u4FDD\u5B58\u751F\u6548");
        } else update("workspaceId", value);
      } })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u8BC6\u522B\u6A21\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: form.model, onChange: (e) => update("model", e.target.value.trim()) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5FEB\u6377\u952E" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "aria-label": "\u5FEB\u6377\u952E", value: form.hotkey, readOnly: true }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "speeker-action", onClick: () => setCapture(!capture), children: capture ? "\u8BF7\u6309\u5FEB\u6377\u952E\uFF0CEsc \u53D6\u6D88" : "\u5F55\u5165\u5FEB\u6377\u952E" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5F55\u97F3\u6A21\u5F0F" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: form.mode, onChange: (e) => update("mode", e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "hold", children: "\u957F\u6309\uFF1A\u6309\u4E0B\u5F00\u59CB\uFF0C\u677E\u5F00\u505C\u6B62" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "toggle", children: "\u70B9\u6309\uFF1A\u518D\u6B21\u6309\u4E0B\u505C\u6B62" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u81EA\u52A8\u53D1\u9001" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: form.autoSend, onChange: (e) => update("autoSend", e.target.checked) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "\u4F7F\u7528\u8BF4\u660E" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u81EA\u52A8\u53D1\u9001\u9ED8\u8BA4\u5173\u95ED\uFF1B\u5F00\u542F\u540E\u63D0\u4EA4\u6574\u4E2A\u8349\u7A3F\u3002\u5F55\u97F3\u671F\u95F4\u7F16\u8F91\u8FC7\u8349\u7A3F\u65F6\uFF0C\u4ECD\u9700\u624B\u52A8\u53D1\u9001\u3002\u6309 Escape \u53D6\u6D88\u5F55\u97F3\uFF0C\u53F3\u952E\u9EA6\u514B\u98CE\u6253\u5F00\u8BBE\u7F6E\u3002AltGr \u5E03\u5C40\u8BF7\u6539\u7ED1\u5FEB\u6377\u952E\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u5730\u57DF\u548C Workspace ID \u5FC5\u987B\u4E0E\u767E\u70BC\u5BC6\u94A5\u4E00\u81F4\u3002\u6A21\u578B\u9700\u652F\u6301 DashScope \u6D41\u5F0F\u8BC6\u522B\u534F\u8BAE\u3002\u97F3\u9891\u53D1\u9001\u81F3\u767E\u70BC\uFF0C\u4E0D\u5199\u5165\u78C1\u76D8\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "speeker-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "speeker-action speeker-primary", type: "button", disabled: busy || !saved?.writable, onClick: () => {
        setBusy(true);
        setSaving(true);
        setMessage("");
        void settings.save(form, revision, key.trim() || void 0, clearKey).then((value) => {
          dirty.current = false;
          setForm(value);
          setRevision(value.revision);
          setKey("");
          setClearKey(false);
          setMessage("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
        }).catch((error2) => setError(error2.message)).finally(() => {
          setBusy(false);
          setSaving(false);
        });
      }, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "speeker-action", disabled: busy, onClick: () => {
        dirty.current = false;
        void settings.refresh().catch((error2) => setError(error2.message));
      }, children: "\u5237\u65B0" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: saved && !saved.writable ? "\u5F53\u524D Harness \u914D\u7F6E\u53EA\u8BFB\u3002" : message }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { children: [
        "\u63D2\u4EF6\u7BA1\u7406 \xB7 v",
        VERSION
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u5378\u8F7D\u4FDD\u7559\u8BBE\u7F6E\u4E0E\u5BC6\u94A5\u3002\u66F4\u65B0\u540E\u5982\u9700\u91CD\u542F\uFF0C\u4F1A\u663E\u793A\u63D0\u793A\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u4E0B\u8F7D\u6765\u6E90" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { disabled: busy, value: form.updateSource, onChange: (e) => {
          update("updateSource", e.target.value);
          setAvailable(false);
          setManagementMessage("");
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "official", children: "GitHub \u5B98\u65B9\u4E0B\u8F7D" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "mirror", children: "GitHub \u955C\u50CF\u4E0B\u8F7D" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "speeker-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u955C\u50CF\u7F51\u5740" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "url", disabled: busy || form.updateSource !== "mirror", value: form.mirrorUrl, placeholder: "https://\u4F60\u7684\u955C\u50CF\u57DF\u540D", onChange: (e) => {
          update("mirrorUrl", e.target.value);
          setAvailable(false);
          setManagementMessage("");
        } })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u955C\u50CF\u9700\u652F\u6301 GitHub API\u3001Raw \u6587\u4EF6\u4E0E\u6E90\u7801\u538B\u7F29\u5305\u3002\u586B\u5199\u7F51\u5740\u524D\u7F00\u5373\u53EF\u3002\u68C0\u67E5\u548C\u66F4\u65B0\u7ACB\u5373\u4F7F\u7528\u5F53\u524D\u9009\u62E9\uFF1B\u70B9\u51FB\u4FDD\u5B58\u53EF\u8BB0\u4F4F\u8BBE\u7F6E\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "speeker-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "speeker-action", disabled: busy, onClick: () => manage("check"), children: "\u68C0\u67E5\u66F4\u65B0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "speeker-action", disabled: busy || !available, onClick: () => manage("update"), children: available ? `\u66F4\u65B0\u81F3 ${latestVersion}` : "\u66F4\u65B0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "speeker-action", disabled: busy, onClick: () => manage("uninstall"), children: "\u4E00\u952E\u5378\u8F7D" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", "aria-label": "\u66F4\u65B0\u72B6\u6001", children: managementMessage }),
      progress && progress.phase !== "idle" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "aria-live": "polite", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("progress", { className: "speeker-progress", "aria-label": "\u66F4\u65B0\u8FDB\u5EA6", max: 100, value: progress.phase === "done" ? 100 : progress.phase === "downloading" && progress.total ? Math.min(100, progress.received / progress.total * 100) : void 0 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: progress.phase === "checking" ? "\u6B63\u5728\u68C0\u67E5\u7248\u672C\u2026" : progress.phase === "installing" ? "\u4E0B\u8F7D\u5B8C\u6210\uFF0C\u6B63\u5728\u5B89\u88C5\u2026" : progress.phase === "done" ? "\u66F4\u65B0\u5B8C\u6210" : progress.phase === "downloading" ? `\u5DF2\u4E0B\u8F7D ${(progress.received / 1024).toFixed(1)} KB${progress.total ? ` / ${(progress.total / 1024).toFixed(1)} KB\uFF08${Math.floor(Math.min(100, progress.received / progress.total * 100))}%\uFF09` : ""}` : "\u66F4\u65B0\u672A\u5B8C\u6210" })
      ] })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageDialog, { message: error, onClose: () => setError(""), onSettings: () => setError("") })
  ] });
}
function apply(ctx) {
  ctx.effect(() => {
    const sheet = document.createElement("style");
    sheet.textContent = style;
    document.head.append(sheet);
    return () => sheet.remove();
  });
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "dsh-speeker", order: 90 }, VoiceButton));
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "dsh-speeker", order: 25, label: () => "\u8BED\u97F3\u8F93\u5165" }, VoiceSettings));
  ctx.effect(() => () => {
    for (const session of sessions) session.cancel();
    sessions.clear();
    owner = void 0;
  });
  void settings.refresh().catch(() => void 0);
}
return module.exports; } });
