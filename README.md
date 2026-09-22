# 放烟花 · 微信小程序

一个零依赖的 **Canvas 2D 粒子动画**小程序：轻触屏幕放一朵烟花，每约 1 秒自动再放一发。

## 效果

- 火箭从屏幕底部升空，抵达目标高度后爆炸
- 爆炸产生 70~110 枚径向粒子 + 中心闪光
- 粒子受重力与阻力衰减，配合半透明覆盖层形成**拖尾发光**
- 支持点击定位爆炸（点哪炸哪），并追加两发随机烟花

## 目录结构

```
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   └── pages/index/           # 烟花页（canvas 2D 粒子系统）
├── project.config.json
└── sitemap.json（在 miniprogram/ 下）
```

## 核心实现（`pages/index/index.js`）

| 环节 | 说明 |
|---|---|
| 初始化 | `wx.createSelectorQuery().fields({node:true,size:true})` 取 canvas 节点，按 `pixelRatio` 适配高清屏 |
| 发射 | `launch(x, targetY)`：从底部生成火箭，带微小横风与重力 |
| 爆炸 | `explode(x, y, color)`：按圆周均匀撒粒子（角度抖动 + 速度抖动），加中心闪光 |
| 渲染 | `globalCompositeOperation='lighter'` 叠加发光；每帧用 `rgba(3,4,10,0.20)` 覆盖形成拖尾 |
| 循环 | `canvas.requestAnimationFrame`；粒子上限 1400，防低端机卡顿 |

## 运行

用微信开发者工具打开本目录 → 编译即可（纯前端，无需云开发、无需配置环境）。

## 部署（Agent 自动化）

本项目的「导入 → 出预览码」链路可完全由 `wechatide` CLI 驱动，详见仓库 `miniprogram-agent-workflow`：

```bash
python <skill>/scripts/wxide.py import  --project "<abs>/烟花小程序"
python <skill>/scripts/wxide.py open    --project "<abs>/烟花小程序"
python <skill>/scripts/wxide.py preview --project "<abs>/烟花小程序" --out preview_qrcode.png
```

## 生成「烟花背景」二维码海报

`tools/make_qr_poster.py` 把预览码合成到程序绘制的烟花夜空背景上（二维码用**整数倍 NEAREST 放大**，保证边缘锐利、可扫）：

```bash
python tools/make_qr_poster.py --qr preview_qrcode.png --out fireworks_qr.png
```

产出 1200×1800 竖版海报：夜空渐变 + 星点 + 11 组彩色烟花爆炸 + 白色圆角卡片承载二维码 + 标题文案。
