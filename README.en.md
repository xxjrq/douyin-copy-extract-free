# Free Douyin Video and Image-post Copy Extractor

Give the skill one Douyin video or image-post URL. It uses your authorized Easy WebBridge browser to extract visible title, description, hashtags, and subtitle clues, then writes an original visible copy, a cleaned reading version, and a concise version.

It is free to use and requires no third-party content API key. It works with videos and image posts, reuses the existing browser login, and supports EasyBR multi-account isolation. One online browser is selected automatically; when several are online, the user must select exactly one environment. It stops on login walls, CAPTCHA, private/deleted works, or empty pages. It never downloads media, interacts, publishes, or stores credentials.

Install [Easy WebBridge](https://github.com/xxjrq/easy-webbridge), with the [Gitee mirror](https://gitee.com/xxjrq/easy-webbridge) as a fallback, then run:

```bash
npm test
node scripts/douyin-copy-extract-free.mjs extract \
  --url "https://www.douyin.com/video/1234567890123456789" \
  --output ./report
```

With multiple online browsers, run `list-browsers` and pass the chosen environment with `--browser-id`. The report contains `douyin-copy.json` and `douyin-copy.md`. Missing visible text stays empty rather than being guessed. A spoken transcript is available only from visible page subtitles or user-supplied local audio processed by local `whisper.cpp`. Review rights and platform rules before publishing.

With a local `whisper.cpp` installation, `--audio /path/to/local-audio.mp3` and `WHISPER_CPP_MODEL=/path/to/ggml-model.bin` add an offline transcript from user-supplied audio. No audio is uploaded or downloaded by this skill. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for adopted references and licenses.

This is a standard `SKILL.md` skill and is not tied to one agent vendor. Agents and tools that support Skills can follow the same workflow.
