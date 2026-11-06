"""Kokoro TTS helper for engine.js (TTS_PROVIDER=kokoro).

Reads text on stdin, writes a WAV. Free, offline, Apache-2.0, ~5x realtime on CPU.

  echo "Hello" | python tts_kokoro.py out.wav

Env:
  KOKORO_DIR    folder with onnx/model.onnx and voices/<name>.bin
                (from huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
  KOKORO_VOICE  af_heart (default, the house voice) · af_bella · am_michael · am_adam …  (a = American, f/m = female/male)
  KOKORO_SPEED  1.0 (default)

Needs: pip install kokoro-onnx soundfile
"""
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

d = os.environ["KOKORO_DIR"]
voice = os.environ.get("KOKORO_VOICE", "af_heart")
style = np.fromfile(os.path.join(d, "voices", f"{voice}.bin"), dtype=np.float32).reshape(-1, 1, 256)
npz = os.path.join(d, "voices.npz")
if not os.path.exists(npz):
    np.savez(npz, **{voice: style})
k = Kokoro(os.path.join(d, "onnx", "model.onnx"), npz)
audio, sr = k.create(sys.stdin.read().strip(), voice=style, speed=float(os.environ.get("KOKORO_SPEED", "1.0")), lang="en-us")
sf.write(sys.argv[1], audio, sr)
