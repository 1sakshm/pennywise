"""Build the launch video's soundtrack: trimmed edge-tts voiceover on a timeline, a synthesized music bed
(royalty-free by construction) with a drop on the result, synthesized SFX, ducking, and a final mix.
Writes audio/mix.wav and timeline.json (line starts/ends + SFX cues) for scene.html to sync to.
    python build_audio.py
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
FF = r"D:\AlanAI\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win64-v4.2.2.exe"
SR = 48000
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(7)


def decode(path):
    raw = subprocess.run([FF, "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def trim(x, thr_db=-38, pad=0.04):
    """-> (trimmed audio, seconds removed from the start)"""
    env = np.convolve(np.abs(x), np.ones(480) / 480, mode="same")
    idx = np.where(env > 10 ** (thr_db / 20))[0]
    if not len(idx):
        return x, 0.0
    a, b = max(0, idx[0] - int(pad * SR)), min(len(x), idx[-1] + int(pad * SR))
    return x[a:b], a / SR


def filt(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x)


def env_ad(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4))
    return e


def tone(freq, dur, shape="sine"):
    t = np.arange(int(dur * SR)) / SR
    ph = 2 * np.pi * np.cumsum(np.full(len(t), freq) if np.isscalar(freq) else freq) / SR
    if shape == "saw":
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if shape == "square":
        return np.sign(np.sin(ph))
    return np.sin(ph)


def noise(dur):
    return rng.standard_normal(int(dur * SR)).astype(np.float32)


# ------------------------------------------------------------------ instruments
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    click = noise(0.45)[:n] * np.exp(-t / 0.004) * 0.3
    return np.tanh(1.6 * (body + click)) * 0.9


def clap():
    x = filt(noise(0.25), "bandpass", [900, 3500]) * env_ad(int(0.25 * SR), 0.002, 0.07)
    return x * 0.55


def hat(open_=False):
    d = 0.18 if open_ else 0.045
    return filt(noise(d), "highpass", 7000) * env_ad(int(d * SR), 0.001, d / 3) * 0.28


def pluck(freq, dur=0.22):
    x = tone(freq, dur, "square") * 0.5 + tone(freq * 2, dur, "saw") * 0.2
    return filt(x, "lowpass", 2600) * env_ad(len(x), 0.003, 0.09) * 0.22


def bass_note(freq, dur):
    x = tone(freq, dur, "saw") + 0.6 * tone(freq / 2, dur, "sine")
    return filt(x, "lowpass", 380) * env_ad(len(x), 0.005, dur * 0.8) * 0.5


def pad(freqs, dur):
    x = sum(tone(f * d, dur, "saw") for f in freqs for d in (0.997, 1.003))
    x = filt(x, "lowpass", 1400) / (2 * len(freqs))
    t = np.arange(len(x)) / SR
    return x * np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.4).clip(0) * 0.5


def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    sweep = np.sin(2 * np.pi * np.cumsum(220 + 1400 * (t / dur) ** 2) / SR) * 0.25
    nz = filt(noise(dur), "highpass", 1500) * 0.35
    return (sweep + nz) * (t / dur) ** 2.2


def impact():
    n = int(1.6 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.55)
    crack = filt(noise(1.6), "bandpass", [300, 6000]) * np.exp(-t / 0.06) * 0.6
    tail = filt(noise(1.6), "lowpass", 900) * np.exp(-t / 0.5) * 0.25
    return np.tanh(1.4 * (boom + crack + tail)) * 0.95


def whoosh(dur=0.5, up=True):
    n = int(dur * SR); x = noise(dur); out = np.zeros(n); seg = n // 16
    for i in range(16):  # stepped bandpass sweep
        fc = 400 * (2 ** ((i if up else 15 - i) / 3))
        out[i * seg:(i + 1) * seg] = filt(x[i * seg:(i + 1) * seg], "bandpass", [fc * 0.6, min(fc * 1.6, 20000)])
    t = np.arange(n) / SR
    return out * np.sin(np.pi * t / dur) ** 1.5 * 0.55


def glitch():
    parts = []
    for _ in range(6):
        d = rng.uniform(0.015, 0.04)
        x = tone(rng.uniform(200, 2400), d, "square") * 0.35
        x = np.round(x * 4) / 4  # bitcrush
        parts.append(x); parts.append(np.zeros(int(rng.uniform(0.004, 0.02) * SR)))
    return np.concatenate(parts)


def tick():
    return tone(2200, 0.03) * env_ad(int(0.03 * SR), 0.001, 0.008) * 0.35


def ding():
    t = np.arange(int(1.2 * SR)) / SR
    return (np.sin(2 * np.pi * 1318.5 * t) + 0.5 * np.sin(2 * np.pi * 2637 * t) + 0.25 * np.sin(2 * np.pi * 3955 * t)) * np.exp(-t / 0.35) * 0.22


def boop():  # comedic "uh-oh" pitch drop for the fumble
    n = int(0.35 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(520 - 300 * t / 0.35) / SR) * env_ad(n, 0.01, 0.15) * 0.3


def add(buf, x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= buf.shape[1]:
        return
    x = x[: buf.shape[1] - i]
    buf[0, i:i + len(x)] += x * gain * (1 - max(0, pan))
    buf[1, i:i + len(x)] += x * gain * (1 + min(0, pan))


# ------------------------------------------------------------------ timeline from the voiceover
lines = json.load(open(HERE / "vo_script.json", encoding="utf-8"))
vo, lead = {}, {}
for l in lines:
    vo[l["id"]], lead[l["id"]] = trim(decode(HERE / "audio" / f"vo_{l['id']}.mp3"))
GAPS = {"hook": 0.8, "laya": 0.8, "problem": 0.8, "what": 0.8, "data": 0.7, "train": 0.7, "galaxy": 0.8, "serve": 0.7, "cascade": 0.9,
        "alan1": 0.6, "alanmcp": 0.7, "alan2": 0.45, "go": 0.25, "result": 0.85, "faster": 1.1, "report": 0.7, "site": 0.7, "close": 0}
INTRO = 2.3
t = INTRO
TL = []
for l in lines:
    d = len(vo[l["id"]]) / SR
    wpath = HERE / "audio" / f"vo_{l['id']}.words.json"
    words = [{"w": w["w"], "t": round(t + w["t"] - lead[l["id"]], 3)} for w in json.load(open(wpath, encoding="utf-8"))] if wpath.exists() else []
    TL.append({"id": l["id"], "text": l["text"], "start": round(t, 3), "end": round(t + d, 3), "words": words})
    t += d + GAPS.get(l["id"], 0.7)
END = t + 2.2  # logo hold
TOTAL = round(END, 2)
L = {x["id"]: x for x in TL}


def WT(line, word, nth=0):
    """Absolute time of a spoken word (case-insensitive prefix match)."""
    hits = [w["t"] for w in L[line]["words"] if w["w"].lower().startswith(word.lower())]
    return hits[nth] if len(hits) > nth else L[line]["start"]


# ------------------------------------------------------------------ music
N = int(TOTAL * SR) + SR
music = np.zeros((2, N), np.float32)
drop = L["faster"]["start"]
build_from = L["result"]["start"]
chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]]  # Am F C G
roots = [110.0, 87.31, 130.81, 98.0]
groove_start = INTRO
bar = 4 * BEAT
nbars = int((TOTAL - groove_start) / bar) + 2
for b in range(nbars):
    t0 = groove_start + b * bar
    if t0 > TOTAL - 0.2:
        break
    ci = b % 4
    in_build = build_from - 0.01 <= t0 < drop
    post = t0 >= drop - 0.01
    add(music, pad([f / 2 for f in chords[ci]], bar + 0.3), t0, 0.55 if not post else 0.7)
    for k in range(4):
        tb = t0 + k * BEAT
        if tb >= TOTAL - 1.2:
            continue
        if not in_build or k % 2 == 0:
            add(music, kick(), tb, 0.9 if post else 0.75)
        if k in (1, 3) and (post or b % 2 == 1) and not in_build:
            add(music, clap(), tb, 0.8, 0.1)
        for h in range(2):
            add(music, hat(open_=(h == 1 and k == 3)), tb + h * BEAT / 2, 0.8 if post else 0.55, -0.3)
        add(music, bass_note(roots[ci], BEAT * 0.9), tb, 0.9)
    if post or b >= 2:  # 16th arp
        for s in range(16):
            tb = t0 + s * BEAT / 4
            if tb < TOTAL - 1.2:
                add(music, pluck(chords[ci][s % 3] * (2 if s % 4 == 3 else 1)), tb, 0.8 if post else 0.5, 0.35 if s % 2 else -0.35)
# build snare roll into the drop
roll_t = build_from
k = 0
while roll_t < drop - 0.02:
    add(music, clap(), roll_t, 0.1 + 0.32 * (roll_t - build_from) / max(0.1, drop - build_from))
    step = BEAT / 2 if roll_t < drop - 2 * BEAT else BEAT / 4
    roll_t += step
# sidechain pump on everything except kick is approximated by a beat-synced gain
tt = np.arange(N) / SR
pump = 1 - 0.35 * np.exp(-((tt - groove_start) % BEAT) / 0.11) * (tt > groove_start)
music *= pump
# fade in/out
music *= np.clip(tt / 0.4, 0, 1)
music *= np.clip((TOTAL - tt) / 1.0, 0, 1)

# ------------------------------------------------------------------ SFX cues
sfx = np.zeros((2, N), np.float32)
CUES = []
def cue(name, x, t, g=1.0, pan=0.0):
    add(sfx, x, t, g, pan); CUES.append({"t": round(t, 3), "sfx": name})
cue("riser", riser(1.2), 0.05, 0.8)
cue("impact", impact(), 1.25, 1.0)  # logo slam (wordmark lands)
cue("whoosh", whoosh(0.5), L["jev"]["start"] - 0.25, 0.9, -0.4)
cue("glitch", glitch(), WT("jev", "main"), 0.8)
cue("whoosh", whoosh(0.45, up=False), L["laya"]["start"] - 0.22, 0.9, 0.4)
cue("glitch", glitch(), WT("laya", "taught"), 0.7)
cue("whoosh", whoosh(0.5), L["problem"]["start"] - 0.25, 0.8, -0.3)
cue("boop", boop(), WT("problem", "slow"), 0.7)
cue("impact", impact(), L["what"]["start"] - 0.05, 0.8)
cue("whoosh", whoosh(0.5), L["data"]["start"] - 0.25, 0.8)
for w in ("three", "nine", "graded"):
    cue("tick", tick(), WT("data", w), 1.0)
cue("whoosh", whoosh(0.5, up=False), L["train"]["start"] - 0.25, 0.8, 0.3)
cue("ding", ding(), WT("train", "rewarded"), 0.6)
cue("boop", boop(), WT("train", "punished"), 0.6)
cue("whoosh", whoosh(0.5), L["galaxy"]["start"] - 0.25, 0.8, -0.3)
cue("boop", boop(), WT("galaxy", "warm"), 0.9)  # "one very warm laptop"
cue("whoosh", whoosh(0.5, up=False), L["serve"]["start"] - 0.25, 0.8, 0.3)
cue("tick", tick(), WT("serve", "base"), 1.0)
cue("whoosh", whoosh(0.5), L["cascade"]["start"] - 0.25, 0.9, -0.3)
cue("boop", boop(), WT("cascade", "fumbles"), 0.8)  # the fumble
cue("ding", ding(), WT("cascade", "escalates"), 1.0)  # escalated, fixed
cue("impact", impact(), L["alan1"]["start"] - 0.05, 0.75)
cue("tick", tick(), WT("alan1", "npm"), 1.0)
cue("tick", tick(), WT("alan1", "connector"), 1.0)
cue("ding", ding(), WT("alan1", "tool"), 0.6)
cue("whoosh", whoosh(0.5), L["alanmcp"]["start"] - 0.25, 0.8, -0.3)
cue("tick", tick(), WT("alanmcp", "Medium"), 1.0)
cue("ding", ding(), WT("alanmcp", "third"), 0.7)
cue("whoosh", whoosh(0.6), L["alan2"]["start"] - 0.3, 0.9, 0.3)
cue("riser", riser(0.9), WT("go", "Go") - 0.9, 0.5)
cue("impact", impact(), WT("go", "Go") - 0.02, 0.9)  # race starts
_rs = max(L["result"]["end"] + 0.05, drop - 1.2)
cue("riser", riser(drop - _rs), _rs, 0.5)  # riser only after "ten for ten" ends
cue("impact", impact(), drop - 0.03, 1.15)  # the drop on "three point four times faster"
cue("whoosh", whoosh(0.4), L["report"]["start"] - 0.2, 0.8, -0.3)
for i in range(4):
    cue("whoosh", whoosh(0.18), L["report"]["start"] + 0.25 + i * 0.22, 0.35, 0.5 - i * 0.3)
cue("whoosh", whoosh(0.5, up=False), L["site"]["start"] - 0.25, 0.8, 0.3)
cue("riser", riser(1.0), L["close"]["start"] - 1.0, 0.6)
cue("impact", impact(), L["close"]["start"] - 0.02, 1.05)
cue("impact", impact(), L["close"]["end"] + 0.15, 0.9)

# ------------------------------------------------------------------ voice + ducking + mix
voice = np.zeros(N, np.float32)
for x in TL:
    v = vo[x["id"]]
    i = int(x["start"] * SR)
    voice[i:i + len(v)] += v[: N - i]
voice = voice / (np.abs(voice).max() + 1e-9) * 0.95
speaking = np.zeros(N)
for x in TL:
    speaking[int((x["start"] - 0.05) * SR):int((x["end"] + 0.1) * SR)] = 1
sm = int(0.12 * SR)
duck = np.convolve(speaking, np.ones(sm) / sm, mode="same")
music_gain = 0.42 - 0.28 * duck  # ~ -9.5 dB under speech
build = ((tt >= build_from) & (tt < drop)).astype(np.float32)
music_gain = music_gain * (1 - 0.45 * build * duck)  # extra ducking while the result line plays over the build
mix = music * music_gain + sfx * 0.55 + np.vstack([voice, voice]) * 1.0
mix = np.tanh(mix * 1.1) / np.tanh(1.1)  # gentle limiter
mix = mix / (np.abs(mix).max() + 1e-9) * 0.93
out = (mix.T * 32767).astype(np.int16)
import wave
with wave.open(str(HERE / "audio" / "mix.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out[: int(TOTAL * SR)].tobytes())
json.dump({"total": TOTAL, "intro": INTRO, "lines": TL, "cues": CUES, "bpm": BPM, "drop": drop}, open(HERE / "timeline.json", "w", encoding="utf-8"), indent=1)
print("total", TOTAL, "s; drop at", round(drop, 2))
for x in TL:
    print(f"  {x['id']:8s} {x['start']:6.2f} -> {x['end']:6.2f}")
