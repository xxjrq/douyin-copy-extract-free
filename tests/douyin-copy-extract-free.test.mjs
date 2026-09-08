import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  applyTranscript,
  normalize,
  parseWork,
  selectBrowser,
  validateUrl,
} from "../scripts/douyin-copy-extract-free.mjs";

const root = path.resolve(import.meta.dirname, "..");
const run = promisify(execFile);
const fixture = async (name) => JSON.parse(await readFile(path.join(root, "fixtures", name), "utf8"));

test("accepts one work URL and strips tracking parameters", () => {
  const work = parseWork("https://www.douyin.com/video/1234567890123456789?aid=tracking#comment");
  assert.equal(work.url, "https://www.douyin.com/video/1234567890123456789");
  assert.equal(work.type, "video");
  assert.throws(() => validateUrl("https://www.douyin.com/search/ai"), /只接受/);
});

test("extracts only visible copy from video and image-post fixtures", async () => {
  const video = await fixture("video-visible-snapshot.json");
  const report = normalize(validateUrl(video.inputUrl), video, "2026-09-07T00:00:00.000Z");
  assert.equal(report.copies.original.text, "先说结论，再给步骤。 #效率 #工作方法");
  assert.equal(report.copies.original.source, "visible-description");
  assert.equal(report.source.pageUrl, video.inputUrl);
  const note = await fixture("note-visible-snapshot.json");
  const noteReport = normalize(validateUrl(note.inputUrl), note, "2026-09-07T00:00:00.000Z");
  assert.equal(noteReport.source.workType, "note");
  assert(!JSON.stringify(noteReport).includes("图片内容"));
});

test("uses the visible page title when Douyin exposes no separate description", () => {
  const input = validateUrl("https://www.douyin.com/video/1234567890123456789");
  const report = normalize(input, {
    url: input.input,
    title: "一天一个 Codex 技巧 #AI工具 - 抖音",
    text: "首页\n推荐\n评论(10)",
  });
  assert.equal(report.copies.original.text, "一天一个 Codex 技巧 #AI工具");
  assert.equal(report.copies.original.source, "visible-page-title");
});

test("blocks login walls instead of inventing copy", async () => {
  const blocked = await fixture("failure-login-gate.json");
  assert.throws(() => normalize(validateUrl(blocked.inputUrl), blocked), /登录|验证/);
});

test("auto-selects exactly one browser and requires a choice for multiple browsers", () => {
  const one = { browserId: "browser-one", displayName: "账号一", online: true };
  const two = { browserId: "browser-two", displayName: "账号二", online: true };
  assert.equal(selectBrowser([one]).browserId, one.browserId);
  assert.equal(selectBrowser([one, two], two.browserId).browserId, two.browserId);
  assert.throws(() => selectBrowser([one, two]), /多个在线浏览器/);
  assert.throws(() => selectBrowser([]), /没有在线浏览器/);
  assert.throws(() => selectBrowser([one], two.browserId), /不在线/);
});

test("labels a local transcript without claiming it came from the page", async () => {
  const video = await fixture("video-visible-snapshot.json");
  const report = normalize(validateUrl(video.inputUrl), video);
  applyTranscript(report, "这是 用户提供的 本地音频。");
  assert.equal(report.copies.original.source, "local-whisper.cpp-transcript");
  assert.equal(report.transcript.suppliedAudio, true);
});

test("CLI writes clean outputs for a fixture", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "douyin-copy-test-"));
  try {
    const video = await fixture("video-visible-snapshot.json");
    const mock = path.join(temp, "mock.json");
    const output = path.join(temp, "output");
    await writeFile(mock, JSON.stringify({ ...video, url: `${video.url}?token=do-not-store` }));
    await run(process.execPath, [path.join(root, "scripts", "douyin-copy-extract-free.mjs"), "extract", "--url", video.inputUrl, "--mock", mock, "--output", output]);
    const json = await readFile(path.join(output, "douyin-copy.json"), "utf8");
    const markdown = await readFile(path.join(output, "douyin-copy.md"), "utf8");
    assert(!json.includes("do-not-store"));
    assert(!/browserId|session|authorization|cookie/i.test(json));
    assert(markdown.includes("免费抖音视频图文文案提取"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI failure removes stale success files and writes a bounded diagnostic", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "douyin-copy-failure-"));
  try {
    const blocked = await fixture("failure-login-gate.json");
    const mock = path.join(temp, "blocked.json");
    const output = path.join(temp, "output");
    await writeFile(mock, JSON.stringify(blocked));
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "douyin-copy.json"), "stale");
    await assert.rejects(
      run(process.execPath, [path.join(root, "scripts", "douyin-copy-extract-free.mjs"), "extract", "--url", blocked.inputUrl, "--mock", mock, "--output", output]),
      (error) => error.code === 1,
    );
    await assert.rejects(access(path.join(output, "douyin-copy.json")));
    const diagnostic = JSON.parse(await readFile(path.join(output, "run-diagnostic.json"), "utf8"));
    assert.equal(diagnostic.reason, "page_access_requires_user_action");
    assert(!JSON.stringify(diagnostic).includes(os.homedir()));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("metadata, icon and repository files satisfy the release contract", async () => {
  const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
  const manifest = await readFile(path.join(root, "manifest.yaml"), "utf8");
  const agent = await readFile(path.join(root, "agents", "openai.yaml"), "utf8");
  assert(skill.startsWith("---\nname: douyin-copy-extract-free\n"));
  assert(manifest.includes('version: "1.0.0"'));
  assert(agent.startsWith("interface:\n"));
  for (const icon of ["icon-512.png", path.join("assets", "icon-512.png")]) {
    const png = await readFile(path.join(root, icon));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
  }
});
