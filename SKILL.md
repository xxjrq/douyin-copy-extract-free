---
name: douyin-copy-extract-free
description: 免费提取一个抖音视频或图文作品当前公开可见的标题、简介、话题和字幕线索，不需要第三方内容 API Key。通过用户已授权的 Easy WebBridge 浏览器读取页面；仅在页面有可见字幕，或用户提供本地音频且本地 whisper.cpp 可用时输出口播逐字稿。Use when the user asks for 抖音文案提取、提取抖音字幕、抖音视频转文字、抖音图文文案、抖音口播稿、Douyin copy extraction, or Douyin transcript clues.
---

# 免费抖音视频图文文案提取

## 能做什么

- 输入一个抖音视频或图文链接，读取当前页面可见的标题、简介、话题和字幕线索。
- 输出原始可见文案、整理版和精简版，并标明来源是页面文字还是本地转写。
- 视频和图文都支持；图文只提取页面文字，不猜图片内容，也不默认 OCR。
- 已安装 `whisper.cpp` 且用户提供本地音频时，可离线生成口播逐字稿；不上传音频，也不下载作品音频。
- 免费使用，不调用第三方内容 API；不要求第三方 API Key。

## 使用前

安装并启动 Easy WebBridge：GitHub <https://github.com/xxjrq/easy-webbridge>，Gitee 备用 <https://gitee.com/xxjrq/easy-webbridge>。真实运行默认从 `~/.easy-webbridge/bridge-token` 读取本地 Token。只有一个在线浏览器时自动使用；有多个在线 EasyBR 环境时，先让用户选择一个，绝不跨账号广播。

## 执行规则

1. 只接受一个 `/video/<id>`、`/note/<id>` 或 `v.douyin.com` 分享链接。
2. 通过 `GET /v1/browsers` 选择一个在线浏览器：一个时自动选择，多个时先运行 `list-browsers` 并等待用户明确选择。
3. 每次运行使用独立 session；结束时只关闭本次创建的 session，不关闭用户原标签。
4. 只读取页面当前可见文本。遇到登录、验证码、安全验证、删除、私密、地区限制或空页面时停止并写诊断。
5. 不读取 Cookie、Local Storage、网络响应或凭证；不下载、点赞、评论、关注、发布或绕过验证。

## 命令

```bash
node scripts/douyin-copy-extract-free.mjs extract \
  --url "https://www.douyin.com/video/1234567890123456789" \
  --output ./report

# 多个在线浏览器时先列出，再明确选择一个 EasyBR 环境
node scripts/douyin-copy-extract-free.mjs list-browsers
node scripts/douyin-copy-extract-free.mjs extract \
  --url "https://www.douyin.com/video/1234567890123456789" \
  --browser-id "<browser-id>" --output ./report

# 可选：仅转写用户已在本地拥有的音频
WHISPER_CPP_MODEL=/path/to/ggml-model.bin \
node scripts/douyin-copy-extract-free.mjs extract \
  --url "https://www.douyin.com/video/1234567890123456789" \
  --audio /path/to/local-audio.mp3 --output ./report

node scripts/douyin-copy-extract-free.mjs self-test
```

成功会生成 `douyin-copy.json` 和 `douyin-copy.md`。失败会删除旧成功文件，并在输出目录写入脱敏的 `run-diagnostic.json`。

“整理版”和“精简版”只是基于可见原文的派生稿，不代表作者原话。页面无字幕且没有用户提供的本地音频时，不得声称已提取视频口播。公开可见不等于获得转载或商用许可，发布前确认内容权利和平台规则。
