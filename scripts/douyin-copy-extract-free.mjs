#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACTIONS = new Set(["navigate", "snapshot", "close_session"]);
const BLOCKED = /登录|验证码|安全验证|访问受限|私密|已删除|地区限制|请先登录/i;
const SECRET = /(?:authorization|cookie|token|browser(?:-|_)?id|session)\s*[:=]\s*[^\s,;]+|FAKE_SECRET_VALUE/gi;

const clean = (value) => String(value ?? "")
  .replace(SECRET, "[redacted]")
  .replaceAll(os.homedir(), "[home]")
  .replace(/[\u200b\ufeff]/g, "")
  .replace(/\s+/g, " ")
  .trim();
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function usage(message) {
  const error = new Error(message);
  error.code = 2;
  throw error;
}

export function parseWork(value) {
  let url;
  try { url = new URL(value); } catch { usage("URL 不是有效网址"); }
  if (!/^https?:$/.test(url.protocol)) usage("URL 必须使用 http 或 https");
  const match = /^(?:www\.)?douyin\.com$/.test(url.hostname) && url.pathname.match(/^\/(video|note)\/(\d+)\/?$/);
  if (!match) return null;
  return {
    url: `${url.protocol}//${url.hostname}/${match[1]}/${match[2]}`,
    type: match[1],
    id: match[2],
  };
}

export function validateUrl(value) {
  if (typeof value !== "string" || !value.trim()) usage("必须提供一个抖音链接");
  const work = parseWork(value.trim());
  if (work) return { input: work.url, work, share: false };
  let url;
  try { url = new URL(value); } catch { usage("URL 不是有效网址"); }
  if (!/^https?:$/.test(url.protocol) || url.hostname !== "v.douyin.com") {
    usage("只接受一个抖音作品链接或 v.douyin.com 分享链接");
  }
  return { input: `${url.protocol}//${url.hostname}${url.pathname}`, work: null, share: true };
}

function linesFromSnapshot(snapshot) {
  return String(snapshot?.text || "").split(/\r?\n/).map(clean).filter(Boolean);
}

export function extractVisible(snapshot, work) {
  const lines = linesFromSnapshot(snapshot);
  if (!lines.length && !clean(snapshot?.title)) throw new Error("页面没有可见文字");
  if (BLOCKED.test(`${snapshot?.title || ""}\n${lines.join("\n")}`)) {
    throw new Error("页面需要登录或人工处理验证");
  }

  const title = clean(snapshot?.title).replace(/\s*[-_|｜]\s*抖音(?:短视频)?\s*$/i, "") || null;
  const boundary = lines.findIndex((line) => /^(评论|推荐|相关视频|相关推荐|大家都在搜|下一条)/.test(line));
  const main = (boundary >= 0 ? lines.slice(0, boundary) : lines).filter((line) =>
    !/^(首页|推荐|朋友|消息|我|分享|返回|更多|点赞|评论|收藏|转发)$/.test(line));
  const authorLine = main.find((line) => /^(作者|创作者|发布者)\s*[:：]/.test(line));
  const author = authorLine?.replace(/^(作者|创作者|发布者)\s*[:：]\s*/, "") || null;
  const metrics = main.filter((line) => /点赞|评论|收藏|分享/.test(line)).slice(0, 4);
  const hashtags = [...new Set(main.join(" ").match(/#[\p{L}\p{N}_-]{1,40}/gu) || [])].map((tag) => tag.slice(1));
  const description = main.find((line) =>
    line !== title && line !== authorLine && line.length >= 8 &&
    !/点赞|评论|收藏|分享/.test(line) &&
    !/^#[\p{L}\p{N}_-]+(?:\s+#[\p{L}\p{N}_-]+)*$/u.test(line)) || null;
  const subtitleLines = main
    .filter((line) => /^(字幕|台词|原声)\s*[:：]/.test(line))
    .map((line) => line.replace(/^(字幕|台词|原声)\s*[:：]\s*/, ""))
    .filter(Boolean);
  if (!title && !description) throw new Error("页面没有可用的作品标题或简介");
  return { title, description, author, hashtags, metrics, subtitleLines, work };
}

export function normalize(input, snapshot, capturedAt = new Date().toISOString()) {
  const work = parseWork(snapshot.url || input.input);
  if (!work) throw new Error("最终页面不是抖音单作品页");
  const visible = extractVisible(snapshot, work);
  const original = visible.subtitleLines.length
    ? visible.subtitleLines.join("\n")
    : visible.description || visible.title;
  const cleaned = original?.replace(/[ \t]+/g, " ").replace(/\s*([，。！？；：])\s*/g, "$1").trim() || null;
  const concise = cleaned ? cleaned.split(/[。！？!?]/)[0].trim() || cleaned : null;
  return {
    schemaVersion: "1.0",
    kind: "douyin-visible-copy",
    status: "success",
    source: {
      inputUrl: input.input,
      pageUrl: work.url,
      workId: work.id,
      workType: work.type,
      capturedAt,
      method: "Easy WebBridge visible page snapshot",
    },
    visible: {
      title: visible.title,
      description: visible.description,
      author: visible.author,
      hashtags: visible.hashtags,
      metrics: visible.metrics,
      subtitleLines: visible.subtitleLines,
    },
    copies: {
      original: {
        text: original,
        source: visible.subtitleLines.length
          ? "visible-subtitle-clues"
          : visible.description
            ? "visible-description"
            : "visible-page-title",
      },
      cleaned: { text: cleaned, source: "normalized-visible-text" },
      concise: { text: concise, source: "derived-from-visible-text" },
    },
    limitations: [
      "Only text visible at capture time is included; missing fields stay empty.",
      "Cleaned and concise copies are derived drafts, not author-approved originals.",
    ],
  };
}

export function transcribeLocalAudio(audioFile) {
  const audio = path.resolve(audioFile);
  if (!fs.existsSync(audio) || !fs.statSync(audio).isFile()) throw new Error("找不到用户提供的本地音频文件");
  const binary = process.env.WHISPER_CPP_BIN || "whisper-cli";
  const model = process.env.WHISPER_CPP_MODEL;
  if (!model || !fs.existsSync(model) || !fs.statSync(model).isFile()) {
    throw new Error("使用 --audio 时必须设置有效的 WHISPER_CPP_MODEL");
  }
  const base = path.join(os.tmpdir(), `douyin-copy-whisper-${process.pid}-${Date.now()}`);
  const result = spawnSync(binary, ["-m", model, "-f", audio, "-otxt", "-of", base], {
    encoding: "utf8",
    timeout: 600_000,
  });
  const transcriptFile = `${base}.txt`;
  try {
    if (result.error) throw new Error("本地 whisper.cpp 无法启动");
    if (result.status !== 0 || !fs.existsSync(transcriptFile)) throw new Error("本地 whisper.cpp 转写失败");
    const text = clean(fs.readFileSync(transcriptFile, "utf8"));
    if (!text) throw new Error("本地 whisper.cpp 没有返回逐字稿");
    return text;
  } finally {
    fs.rmSync(transcriptFile, { force: true });
  }
}

export function applyTranscript(report, transcript) {
  const cleaned = transcript.replace(/\s*([，。！？；：])\s*/g, "$1").trim();
  report.transcript = { text: transcript, engine: "local-whisper.cpp", suppliedAudio: true };
  report.copies = {
    original: { text: transcript, source: "local-whisper.cpp-transcript" },
    cleaned: { text: cleaned, source: "normalized-local-transcript" },
    concise: { text: cleaned.split(/[。！？!?]/)[0].trim() || cleaned, source: "derived-from-local-transcript" },
  };
  report.limitations.push("The local transcript is generated from user-supplied audio and may contain recognition errors.");
  return report;
}

export function selectBrowser(browsers, requestedId = null) {
  const online = (Array.isArray(browsers) ? browsers : []).filter((browser) => browser?.online && browser.browserId);
  if (requestedId) {
    const selected = online.find((browser) => browser.browserId === requestedId);
    if (!selected) throw new Error("指定的浏览器当前不在线，请重新查看在线浏览器");
    return selected;
  }
  if (online.length === 1) return online[0];
  if (online.length === 0) throw new Error("没有在线浏览器，请先启动 Easy WebBridge 并连接扩展");
  throw new Error("检测到多个在线浏览器，请先运行 list-browsers，再用 --browser-id 明确选择一个环境");
}

async function bridgeRequest(base, endpoint, token, init = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) throw new Error(`Easy WebBridge 请求失败（HTTP ${response.status}）`);
  return response.json();
}

function bridgeConfig(input = {}) {
  const base = (process.env.EASY_WEBBRIDGE_URL || process.env.SKILL_FACTORY_WEBBRIDGE_URL || "http://127.0.0.1:17777").replace(/\/$/, "");
  const tokenPath = process.env.EASY_WEBBRIDGE_TOKEN_FILE || process.env.SKILL_FACTORY_WEBBRIDGE_TOKEN_FILE || path.join(os.homedir(), ".easy-webbridge", "bridge-token");
  let token;
  try { token = fs.readFileSync(tokenPath, "utf8").trim(); } catch { throw new Error("找不到 Easy WebBridge Token 文件"); }
  if (!token) throw new Error("Easy WebBridge Token 文件为空");
  return {
    base,
    token,
    browserId: input.browserId || process.env.EASY_WEBBRIDGE_BROWSER_ID || process.env.SKILL_FACTORY_WEBBRIDGE_BROWSER_ID || null,
  };
}

async function listBrowsers() {
  const config = bridgeConfig();
  const listed = await bridgeRequest(config.base, "/v1/browsers", config.token);
  return (listed.browsers || []).filter((browser) => browser?.online).map((browser) => ({
    browserId: browser.browserId,
    displayName: browser.displayName || browser.browserId,
    browser: browser.browser || "Chromium",
  }));
}

async function realExtract(input) {
  const config = bridgeConfig(input);
  const listed = await bridgeRequest(config.base, "/v1/browsers", config.token);
  const selected = selectBrowser(listed.browsers, config.browserId);
  const session = `douyin-copy-extract-free-${Date.now()}-${process.pid}`;
  let created = false;
  const command = async (action, args) => {
    if (!ACTIONS.has(action)) throw new Error("浏览器动作不在允许列表");
    const payload = await bridgeRequest(
      config.base,
      `/v1/browsers/${encodeURIComponent(selected.browserId)}/commands`,
      config.token,
      { method: "POST", body: JSON.stringify({ action, args, timeoutMs: 20_000 }) },
    );
    return payload.result ?? payload;
  };
  try {
    created = true;
    const nav = await command("navigate", {
      url: input.input,
      newTab: true,
      active: true,
      session,
      groupTitle: "抖音文案提取",
    });
    const tabId = nav?.tabId;
    if (!tabId) throw new Error("导航没有返回标签页");
    const deadline = Date.now() + 12_000;
    let lastError = new Error("页面内容仍在加载");
    do {
      try {
        const snapshot = await command("snapshot", { tabId, maxTextLength: 24_000 });
        return normalize(input, snapshot);
      } catch (error) {
        lastError = error;
        if (/登录|验证|访问受限|私密|已删除|地区限制/.test(error.message)) throw error;
        await sleep(500);
      }
    } while (Date.now() < deadline);
    throw lastError;
  } finally {
    if (created) {
      try { await command("close_session", { session }); } catch {}
    }
  }
}

function diagnosticCode(reason) {
  const text = clean(reason);
  if (/多个在线浏览器/.test(text)) return "browser_selection_required";
  if (/没有在线浏览器|浏览器当前不在线/.test(text)) return "browser_unavailable";
  if (/登录|验证|访问受限|私密|已删除|地区限制/.test(text)) return "page_access_requires_user_action";
  if (/Token|WebBridge|HTTP/.test(text)) return "bridge_unavailable";
  if (/whisper|音频|WHISPER/.test(text)) return "local_transcription_unavailable";
  if (/页面|作品页/.test(text)) return "visible_copy_unavailable";
  return "extraction_failed";
}

function writeDiagnostic(output, reason) {
  const code = diagnosticCode(reason);
  const next = {
    browser_selection_required: "运行 list-browsers，并用 --browser-id 选择一个环境后重试",
    browser_unavailable: "启动 Easy WebBridge 并确认目标浏览器扩展在线后重试",
    page_access_requires_user_action: "在目标浏览器中完成登录或验证，确认作品可见后重试",
    bridge_unavailable: "检查 Easy WebBridge 服务和本地 Token 文件后重试",
    local_transcription_unavailable: "检查用户本地音频、whisper.cpp 和模型配置后重试",
    visible_copy_unavailable: "确认链接是公开可见的单个抖音视频或图文作品",
    extraction_failed: "检查输入和运行环境后重试",
  }[code];
  writeJson(path.join(output, "run-diagnostic.json"), { status: "needs_user_action", reason: code, next });
}

function clearSuccess(output) {
  for (const file of ["douyin-copy.json", "douyin-copy.md"]) {
    try { fs.rmSync(path.join(output, file), { force: true }); } catch {}
  }
}

export function markdown(report) {
  const { visible, copies } = report;
  return [
    "# 免费抖音视频图文文案提取",
    `- 作品类型：${report.source.workType === "note" ? "图文" : "视频"}`,
    `- 页面标题：${visible.title || "未显示"}`,
    `- 作者：${visible.author || "未显示"}`,
    `- 话题：${visible.hashtags.length ? visible.hashtags.map((tag) => `#${tag}`).join(" ") : "未显示"}`,
    "",
    "## 原始可见文案",
    copies.original.text || "页面没有显示可提取文案",
    "",
    "## 整理版",
    copies.cleaned.text || "暂无",
    "",
    "## 精简版",
    copies.concise.text || "暂无",
    "",
    "## 提取范围",
    "只包含抓取时页面可见文字，或用户主动提供的本地音频转写；缺失内容不会猜测。",
    "",
  ].join("\n");
}

export async function selfTest() {
  const video = readJson(path.join(ROOT, "fixtures/video-visible-snapshot.json"));
  const note = readJson(path.join(ROOT, "fixtures/note-visible-snapshot.json"));
  const report = normalize(validateUrl(video.inputUrl), video, "2026-09-07T00:00:00.000Z");
  if (report.copies.original.text !== "先说结论，再给步骤。 #效率 #工作方法") throw new Error("visible copy extraction failed");
  const noteReport = normalize(validateUrl(note.inputUrl), note, "2026-09-07T00:00:00.000Z");
  if (noteReport.source.workType !== "note" || noteReport.copies.original.text.includes("图片内容")) throw new Error("note boundary failed");
  selectBrowser([{ browserId: "one", online: true }]);
  try {
    selectBrowser([{ browserId: "one", online: true }, { browserId: "two", online: true }]);
    throw new Error("multiple browsers were accepted");
  } catch (error) {
    if (!/多个在线浏览器/.test(error.message)) throw error;
  }
  return { status: "passed", assertions: 4, network: "blocked-by-design" };
}

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (!key.startsWith("--") || !args[i + 1]) usage(`参数错误：${key}`);
    options[key.slice(2)] = args[++i];
  }
  return options;
}

async function main() {
  const [verb = "help", ...args] = process.argv.slice(2);
  try {
    if (verb === "help") {
      console.log("node scripts/douyin-copy-extract-free.mjs extract --url <url> [--browser-id <id>] [--audio <local-audio>] --output <dir>\nnode scripts/douyin-copy-extract-free.mjs list-browsers");
      return;
    }
    if (verb === "self-test") {
      console.log(JSON.stringify(await selfTest()));
      return;
    }
    if (verb === "list-browsers") {
      console.log(JSON.stringify({ status: "success", browsers: await listBrowsers() }, null, 2));
      return;
    }
    if (verb !== "extract") usage("只支持 extract、list-browsers、self-test、help");
    const options = parseOptions(args);
    const input = validateUrl(options.url);
    const output = path.resolve(options.output || "./douyin-copy-report");
    fs.mkdirSync(output, { recursive: true });
    clearSuccess(output);
    try {
      const browserId = options["browser-id"] || options.browserId;
      const report = options.mock ? normalize(input, readJson(options.mock)) : await realExtract({ ...input, browserId });
      if (options.audio) applyTranscript(report, transcribeLocalAudio(options.audio));
      writeJson(path.join(output, "douyin-copy.json"), report);
      fs.writeFileSync(path.join(output, "douyin-copy.md"), markdown(report));
      fs.rmSync(path.join(output, "run-diagnostic.json"), { force: true });
      console.log(JSON.stringify({ status: "success", output }));
    } catch (error) {
      clearSuccess(output);
      writeDiagnostic(output, error.message);
      throw error;
    }
  } catch (error) {
    console.error(clean(error.message));
    process.exitCode = error.code || 1;
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
