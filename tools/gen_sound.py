#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合成烟花爆炸音效 boom.wav（纯标准库，无第三方依赖）。

设计：短促"升空咻声" + 爆裂噪声 + 低频 thump，指数衰减包络。
输出 16kHz / 16bit / 单声道 WAV，约 0.6s，打进小程序代码包供 InnerAudioContext 播放。
"""
import math
import os
import random
import struct
import wave

SR = 16000          # 采样率
DUR = 0.6           # 时长（秒）
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "miniprogram", "audio", "boom.wav"
)


def synth():
    n = int(SR * DUR)
    random.seed(20260923)
    samples = []
    # 一阶低通状态，用于把白噪声滤成更柔和的"噼啪"声
    lp = 0.0
    for i in range(n):
        t = i / SR
        # 包络：5ms 快速起音，之后指数衰减
        attack = 0.005
        if t < attack:
            env = t / attack
        else:
            env = math.exp(-(t - attack) * 9.0)
        # 升空"咻"：前 120ms 一段上滑的窄带噪声
        if t < 0.12:
            whoosh = (random.random() * 2 - 1) * math.exp(-t * 8.0) * 0.5
        else:
            whoosh = 0.0
        # 低频 thump（爆炸体感）
        thump = math.sin(2 * math.pi * 72 * t) * math.exp(-t * 6.0)
        # 爆裂噪声：白噪声经一阶低通，乘衰减
        white = random.random() * 2 - 1
        lp = lp * 0.55 + white * 0.45
        crack = lp * env
        s = 0.42 * thump + 0.55 * crack + 0.25 * whoosh
        s *= env
        samples.append(s)
    # 归一化到 90% 峰值，避免削波
    peak = max((abs(min(samples)), abs(max(samples))))
    if peak <= 0:
        peak = 1.0
    pcm = bytearray()
    for x in samples:
        v = int((x / peak) * 32767 * 0.9)
        v = max(-32768, min(32767, v))
        pcm += struct.pack("<h", v)
    return bytes(pcm)


def main():
    pcm = synth()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with wave.open(OUT, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)
    size = os.path.getsize(OUT)
    print("wrote", OUT, "size=%d bytes (%.1f KB)" % (size, size / 1024))


if __name__ == "__main__":
    main()
