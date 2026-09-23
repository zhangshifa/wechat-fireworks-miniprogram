# 音效来源声明（Audio Attribution）

本目录下的烟花音效文件为**真实录音**，直接取自 `fangyanhua.top` 同源项目：

- 上游仓库：https://github.com/NianBroken/Firework_Simulator
- 衍生站点：https://fangyanhua.top （fork 自上述项目，翻译 + 优化）
- 音频目录：原仓库 `audio/`

## 文件映射

| 文件 | 含义 | 原站点调用名 |
|------|------|--------------|
| lift1.mp3 / lift2.mp3 / lift3.mp3 | 火箭升空「咻」声 | `lift` |
| burst1.mp3 / burst2.mp3 | 大型爆炸「砰」 | `burst` |
| burst-sm-1.mp3 / burst-sm-2.mp3 | 小型爆炸 | `burstSmall` |
| crackle1.mp3 / crackle-sm-1.mp3 | 炸后「噼啪」余响 | `crackleSmall` |

## 许可（License）

原项目使用 **Apache License 2.0**。

- 可自由使用、修改、再分发（含商业用途）。
- 需保留版权声明与许可证文本（本说明即为此用途）。
- 原始 `NOTICE` 文件若随原仓库分发，亦应一并保留。

小程序内调用逻辑见 `pages/index/index.js` 的 `initAudio / playLaunch / playBoom`。
