# 免费抖音视频图文文案提取

输入一个抖音视频或图文链接，复用你已经登录的浏览器，提取页面当前可见的标题、简介、话题和字幕线索，生成可读报告。

## 亮点

- 免费使用，免第三方内容 API Key
- 视频、图文作品都支持
- 复用现有登录状态，不用重复登录
- 支持 EasyBR 多账号隔离：单浏览器自动选择，多浏览器必须明确选择一个环境
- 失败会说明是登录、验证、作品不可见还是页面没有文案
- 只读单个作品，不自动下载、互动或发布

## 快速开始

先安装并启动 [Easy WebBridge](https://github.com/xxjrq/easy-webbridge)，Gitee 备用地址为 [xxjrq/easy-webbridge](https://gitee.com/xxjrq/easy-webbridge)。

```bash
npm test
node scripts/douyin-copy-extract-free.mjs extract \
  --url "https://www.douyin.com/video/1234567890123456789" \
  --output ./report
```

只有一个在线浏览器时会自动使用。多个在线浏览器时先查看列表，再选择一个 EasyBR 环境：

```bash
node scripts/douyin-copy-extract-free.mjs list-browsers
node scripts/douyin-copy-extract-free.mjs extract \
  --url "https://www.douyin.com/video/1234567890123456789" \
  --browser-id "<browser-id>" --output ./report
```

真实运行需要本机 Bridge Token 文件。Token、Cookie、浏览器 ID 和任务 session 不会写入报告。

若已经安装 [whisper.cpp](https://github.com/ggerganov/whisper.cpp)，也可以为用户本地已有的音频生成逐字稿；音频不会上传，Skill 也不会从抖音下载音频：

```bash
WHISPER_CPP_MODEL=/path/to/ggml-model.bin \
node scripts/douyin-copy-extract-free.mjs extract \
  --url "https://www.douyin.com/video/1234567890123456789" \
  --audio /path/to/local-audio.mp3 --output ./report
```

## 输出

`douyin-copy.json` 保存结构化结果，`douyin-copy.md` 方便阅读。视频口播只在页面有可见字幕，或用户提供本地音频且本地 `whisper.cpp` 可用时提取；否则不猜测。整理版和精简版是基于已提取文字的派生稿，发布前请人工确认事实、版权和平台规则。

这是标准 `SKILL.md` 技能，不限定某一种智能体；支持读取 Skills 的 Codex、Claude、WorkBuddy、OpenCode 等工具都可以按同一说明调用。

## 许可证

MIT，见 [LICENSE](LICENSE)。

实现来源和许可证核对见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
