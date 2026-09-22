#!/usr/bin/env python3
"""把小程序预览二维码合成到「烟花夜空」背景上，输出成品海报。

要点：二维码用 **整数倍 NEAREST 放大**，不做插值，保证模块边缘锐利、可扫。

用法:
    python make_qr_poster.py --qr preview_qrcode.png --out fireworks_qr.png
仅用标准库 + Pillow。
"""
import argparse
import math
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 1800
SEED = 20260922
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"

COLORS = [
    (255, 77, 109), (255, 209, 102), (6, 214, 160), (76, 201, 240),
    (181, 23, 158), (247, 37, 133), (255, 158, 0), (123, 47, 247),
    (0, 245, 212), (254, 250, 224),
]


def night_sky():
    base = Image.new("RGB", (W, H), (3, 4, 10))
    d = ImageDraw.Draw(base)
    top, bottom = (7, 12, 32), (2, 2, 6)
    for y in range(H):
        t = y / H
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    for _ in range(700):
        x, y = random.randint(0, W - 1), random.randint(0, int(H * 0.82))
        v = random.randint(70, 230)
        s = random.choice([1, 1, 1, 2])
        d.ellipse([x, y, x + s, y + s], fill=(v, v, min(255, v + 20)))
    return base


def firework_layer():
    """黑色 RGB 图层上画烟花（供 screen 叠加发光）。"""
    light = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(light)

    bursts = [
        (int(W * 0.18), int(H * 0.14)),
        (int(W * 0.82), int(H * 0.10)),
        (int(W * 0.50), int(H * 0.06)),
        (int(W * 0.10), int(H * 0.38)),
        (int(W * 0.90), int(H * 0.34)),
        (int(W * 0.30), int(H * 0.50)),
        (int(W * 0.70), int(H * 0.47)),
        (int(W * 0.05), int(H * 0.62)),
        (int(W * 0.95), int(H * 0.64)),
        (int(W * 0.22), int(H * 0.86)),
        (int(W * 0.78), int(H * 0.88)),
    ]
    for cx, cy in bursts:
        col = random.choice(COLORS)
        n = random.randint(110, 165)
        R = random.randint(100, 170)
        for _ in range(n):
            a = random.uniform(0, 2 * math.pi)
            r = R * random.uniform(0.5, 1.0)
            x = cx + math.cos(a) * r
            y = cy + math.sin(a) * r
            j = random.uniform(0.65, 1.0)
            c = tuple(min(255, int(cc * j)) for cc in col)
            s = random.uniform(1.2, 2.6)
            d.ellipse([x - s, y - s, x + s, y + s], fill=c)
        d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(255, 252, 235))

    for _ in range(16):
        x = random.randint(int(W * 0.05), int(W * 0.95))
        y0 = random.randint(int(H * 0.60), int(H * 0.95))
        c = random.choice(COLORS)
        for k in range(random.randint(10, 24)):
            y = y0 - k * 10
            a = 1 - k / 24
            cc = tuple(int(cc * a) for cc in c)
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=cc)
    return light


def build_background():
    base = night_sky()
    light = firework_layer()
    glow = light.filter(ImageFilter.GaussianBlur(20))
    img = ImageChops.screen(base, glow)
    img = ImageChops.screen(img, light)
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse(
        [-int(W * 0.25), -int(H * 0.12), int(W * 1.25), int(H * 1.12)], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(150))
    dark = Image.new("RGB", (W, H), (0, 0, 0))
    return Image.composite(img, Image.blend(img, dark, 0.45), vig)


def rounded_card(size, radius, fill=(255, 255, 255, 255)):
    card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, fill=fill)
    return card


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qr", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="放烟花")
    ap.add_argument("--subtitle", default="微信扫码 · 立即体验")
    args = ap.parse_args()

    random.seed(SEED)
    img = build_background()

    # 二维码：整数倍 NEAREST 放大（不插值，边缘锐利）
    qr = Image.open(args.qr).convert("L")
    qw, qh = qr.size
    k = max(1, int(W * 0.80) // max(qw, qh))
    qr = qr.resize((qw * k, qh * k), Image.NEAREST).convert("RGB")
    qside = max(qw * k, qh * k)

    margin = 56
    card_size = qside + margin * 2
    card = rounded_card(card_size, 56)
    off = (card_size - qr.size[0]) // 2
    card.paste(qr, (off, (card_size - qr.size[1]) // 2))

    cx = (W - card_size) // 2
    cy = int(H * 0.575) - card_size // 2

    # 卡片外发光
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(halo).rounded_rectangle(
        [cx - 28, cy - 28, cx + card_size + 28, cy + card_size + 28],
        radius=76, fill=(255, 230, 190, 125))
    halo = halo.filter(ImageFilter.GaussianBlur(48))
    img = Image.alpha_composite(img.convert("RGBA"), halo).convert("RGB")
    img.paste(card, (cx, cy), card)

    # 文案
    f_title = ImageFont.truetype(FONT_BOLD, 118, index=0)
    f_sub = ImageFont.truetype(FONT_REG, 50, index=0)
    f_tip = ImageFont.truetype(FONT_REG, 34, index=0)

    def glow_text(text, font, y, fill):
        d0 = ImageDraw.Draw(img)
        x = (W - d0.textlength(text, font=font)) / 2
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(g).text((x, y), text, font=font, fill=fill)
        g = g.filter(ImageFilter.GaussianBlur(18))
        merged = Image.alpha_composite(img.convert("RGBA"), g).convert("RGB")
        ImageDraw.Draw(merged).text((x, y), text, font=font, fill=fill)
        return merged

    img = glow_text(args.title, f_title, int(H * 0.095), (255, 236, 202))

    d = ImageDraw.Draw(img)
    w = d.textlength(args.subtitle, font=f_sub)
    d.text(((W - w) / 2, cy + card_size + 52), args.subtitle,
           font=f_sub, fill=(255, 255, 255))
    tip = "此码为开发者预览版，仅开发者/体验成员可打开"
    wt = d.textlength(tip, font=f_tip)
    d.text(((W - wt) / 2, cy + card_size + 124), tip,
           font=f_tip, fill=(150, 160, 190))

    img.save(args.out, quality=95)
    print(f"已生成: {args.out}  尺寸={img.size}  码放大={k}x(NEAREST)  码边长={qside}px")


if __name__ == "__main__":
    main()
