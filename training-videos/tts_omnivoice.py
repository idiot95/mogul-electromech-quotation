"""OmniVoice TTS helper for engine.js (TTS_PROVIDER=omnivoice).

Batch mode: loads the model once, voices every line in a JSON job file.
  python tts_omnivoice.py jobs.json        # jobs.json = [{"text": "...", "out": "/path/x.wav"}, ...]

The voice is cloned from one reference clip so it stays identical across scenes
(voice design alone gives a slightly different speaker on every call).

Env:
  OMNIVOICE_SRC       checkout of github.com/debpalash/voicestudio (contains the omnivoice package)
  OMNIVOICE_REF       reference WAV (e.g. a clip made once with instruct="male, middle-aged, american accent")
  OMNIVOICE_REF_TEXT  exact words spoken in the reference clip
  OMNIVOICE_DEVICE    cpu (default) | cuda:0
Needs: torch, torchaudio, transformers>=5.10, accelerate, soundfile (+ audioop-lts on Python 3.13)
CPU speed: about 4x slower than real time; a GPU brings it to seconds.
"""
import json
import os
import sys
import time

import soundfile as sf
import torch

sys.path.insert(0, os.environ["OMNIVOICE_SRC"])
from omnivoice import OmniVoice  # noqa: E402

device = os.environ.get("OMNIVOICE_DEVICE", "cpu")
torch.set_num_threads(os.cpu_count() or 4)
model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device,
                                  dtype=torch.float32 if device == "cpu" else torch.float16)
jobs = json.load(open(sys.argv[1]))
for i, job in enumerate(jobs, 1):
    t = time.time()
    audio = model.generate(text=job["text"], ref_audio=os.environ["OMNIVOICE_REF"],
                           ref_text=os.environ["OMNIVOICE_REF_TEXT"])
    audio = audio[0] if isinstance(audio, (list, tuple)) else audio
    audio = audio.squeeze().float().cpu().numpy() if hasattr(audio, "cpu") else audio
    sf.write(job["out"], audio, 24000)
    print(f"  omnivoice {i}/{len(jobs)}: {len(audio) / 24000:.1f}s in {time.time() - t:.0f}s", file=sys.stderr, flush=True)
