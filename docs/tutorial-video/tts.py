# Voice-over per scene with Kokoro (voice af_heart, offline, free). Writes audio/<id>.mp3 and durations.json.
import json, os, subprocess, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
K = os.environ.get("KOKORO_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "kokoro"))
voice = os.environ.get("KOKORO_VOICE", "af_heart")
style = np.fromfile(os.path.join(K, "voices", f"{voice}.bin"), dtype=np.float32).reshape(-1, 1, 256)
npz = os.path.join(K, "voices.npz")
if not os.path.exists(npz): np.savez(npz, **{voice: style})
k = Kokoro(os.path.join(K, "onnx", "model.onnx"), npz)
scenes = json.load(open("scenes.json")); os.makedirs("audio", exist_ok=True)
out = {}
for s in scenes:
    f = f"audio/{s['id']}.mp3"
    if not os.path.exists(f) or "--force" in sys.argv:
        audio, sr = k.create(s["text"], voice=style, speed=float(os.environ.get("KOKORO_SPEED", "0.95")), lang="en-us")
        sf.write("audio/tmp.wav", audio, sr)
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", "audio/tmp.wav", "-b:a", "160k", f], check=True)
    d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())
    out[s["id"]] = round(d, 2); print(s["id"], d, flush=True)
json.dump(out, open("durations.json", "w"))
print("total", sum(out.values()))
