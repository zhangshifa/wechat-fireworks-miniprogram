#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合成更真实的烟花音效（纯标准库，无第三方依赖）。

真实烟花声音 = 三段：
  1) 升空「咻」声 launch.wav  —— 带通噪声，中心频率上扫，渐弱
  2) 爆炸「砰」冲击 boom.wav   —— 低频 thump + 宽频噪声爆发
  3) 爆炸后「噼啪」余响        —— 高频带通噪声随机脉冲串，整体衰减
launch 在火箭升空时播放，boom 在爆炸时播放，时间上自然衔接。
输出 16kHz / 16bit / 单声道 WAV，打进小程序代码包。
"""
import math
import os
import random
import struct
import wave

SR = 16000  # 采样率
AUDIO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "miniprogram", "audio"
)


def svf_bandpass(x, fc, q, state):
    """状态变量滤波器（SVF），返回 bandpass 输出。state=[low, band]。"""
    fc = min(fc, SR / 2 - 100)
    f = 2.0 * math.sin(math.pi * fc / SR)
    if f > 0.95:  # SVF 稳定上限，超过会发散
        f = 0.95
    low, band = state
    low += f * band
    high = x - low - q * band
    band += f * high
    # 安全钳制，防止极端参数下数值爆炸
    if not math.isfinite(band):
        band = 0.0
    if not math.isfinite(low):
        low = 0.0
    state[0], state[1] = low, band
    return band


def write_wav(path, pcm16):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm16)


def synth_launch():
    """升空「咻」声：约 0.7s，带通噪声中心频率 600->2200Hz 上扫，渐弱。"""
    n = int(SR * 0.7)
    random.seed(11)
    out = []
    st = [0.0, 0.0]
    for i in range(n):
        t = i / SR
        fc = 600 + (2200 - 600) * (t / 0.7)
        x = random.random() * 2 - 1
        bp = svf_bandpass(x, fc, 1.0, st)
        if t < 0.02:
            env = t / 0.02
        elif t < 0.18:
            env = 1.0
        else:
            env = math.exp(-(t - 0.18) * 3.0)
        amp = 0.6 + 0.4 * math.sin(t * 40)
        out.append(bp * env * amp * 0.5)
    return out


def synth_boom():
    """爆炸「砰」+「噼啪」余响：约 1.3s。"""
    n = int(SR * 1.3)
    random.seed(23)
    out = [0.0] * n
    # —— 爆炸冲击（前段）——
    for i in range(n):
        t = i / SR
        thump = (math.sin(2 * math.pi * 55 * t) +
                 0.5 * math.sin(2 * math.pi * 95 * t)) * math.exp(-t * 7.0)
        white = random.random() * 2 - 1
        burst = white * math.exp(-t * 6.0)
        out[i] += 0.5 * thump + 0.5 * burst
    # —— 噼啪尾音（后段随机脉冲串）——
    st = [0.0, 0.0]
    for i in range(n):
        t = i / SR
        if t < 0.09:
            continue
        p = 0.02 * math.exp(-(t - 0.09) * 1.5)  # 触发概率随时间降低
        if random.random() < p:
            dur = int(SR * (0.004 + random.random() * 0.012))
            mag = (0.3 + 0.7 * random.random()) * math.exp(-(t - 0.09) * 1.8)
            fc = 1200 + random.random() * 1000
            for k in range(dur):
                j = i + k
                if j >= n:
                    break
                x = random.random() * 2 - 1
                bp = svf_bandpass(x, fc, 1.0, st)
                pe = math.exp(-k / (SR * 0.004))  # 脉冲内快速衰减
                out[j] += bp * pe * mag * 0.7
    return out


def to_pcm(samples):
    peak = max(abs(min(samples)), abs(max(samples))) or 1.0
    buf = bytearray()
    for x in samples:
        v = int((x / peak) * 32767 * 0.9)
        v = max(-32768, min(32767, v))
        buf += struct.pack("<h", v)
    return bytes(buf)


def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    lp = os.path.join(AUDIO_DIR, "launch.wav")
    bp = os.path.join(AUDIO_DIR, "boom.wav")
    write_wav(lp, to_pcm(synth_launch()))
    write_wav(bp, to_pcm(synth_boom()))
    print("launch.wav", os.path.getsize(lp), "bytes")
    print("boom.wav  ", os.path.getsize(bp), "bytes")


if __name__ == "__main__":
    main()
