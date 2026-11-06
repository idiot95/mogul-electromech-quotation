# Staff tutorial video

Scripts that produce the narrated walkthrough `Mogul-Workspace-Tutorial.mp4` (≈6½ min, 1080p, burned-in subtitles):
sign-in, dashboard, a quotation from an Excel paste and a PDF import, print/email, won/lost, list, customers, users and settings.
The video drives the real app, so re-run it after UI changes.

| File | What it does |
|---|---|
| `scenes.json` | Narration, one entry per scene (edit the wording here) |
| `tts.py` | Generates the voice-over per scene with Kokoro, voice `af_heart` (offline, free) → `audio/`, `durations.json` |
| `reset.sh` + `seed.mjs` | Fresh local DB: demo users (Sales Reps), customers, quotations with won/lost results; `taher` gets a temporary password for the sign-in scene |
| `record.cjs` + `overlay.js` | Plays each scene in Chromium on Xvfb, draws cursor / step titles / key badges, screen-records with ffmpeg → `raw.mp4`, `timeline.json` |
| `mix.py` | Places each voice clip at its scene start, adds subtitles, encodes the final MP4s |
| `paste.txt`, `enquiry.html`, `working.html` | The sample Excel enquiry, the PDF enquiry (printed to `ESF-1107 RFQ.pdf`) and the "working" photo used in the demo |

## Re-make the video

Needs `xvfb-run`, `ffmpeg` (with libass), Playwright's Chromium and Kokoro (`pip install kokoro-onnx soundfile`, with `onnx/model.onnx` and `voices/af_heart.bin` from huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX in `$KOKORO_DIR`).

```bash
npm install && npx vite build
cd docs/tutorial-video
KOKORO_DIR=/path/to/kokoro python3 tts.py
node -e "require('playwright').chromium.launch().then(async b=>{const p=await b.newPage();await p.goto('file://'+process.cwd()+'/enquiry.html');await p.pdf({path:'ESF-1107 RFQ.pdf',format:'A4'});await b.close()})"
node -e "require('playwright').chromium.launch().then(b=>b.newPage().then(p=>p.goto('file://'+process.cwd()+'/working.html').then(()=>p.setViewportSize({width:800,height:600})).then(()=>p.screenshot({path:'working.png'}))).then(()=>b.close()))"
./reset.sh
xvfb-run -a -s "-screen 0 1536x864x24" node record.cjs
python3 mix.py
```

Test run without recording (fast, screenshots per scene in `shots/`): `mkdir -p shots && DRY=1 FAST=0.3 xvfb-run -a -s "-screen 0 1536x864x24" node record.cjs`.
