# Staff tutorial video

Scripts that produce the narrated walkthrough `Mogul-Workspace-Tutorial.mp4` (≈6½ min, 1080p, burned-in subtitles).
The video drives the real app, so re-run it after UI changes.

| File | What it does |
|---|---|
| `scenes.json` | Narration, one entry per scene (edit the wording here) |
| `tts.py` | Generates the voice-over per scene with ElevenLabs (voice "Alice") → `audio/`, `durations.json` |
| `reset.sh` + `seed.mjs` | Fresh local DB with demo customers and quotes |
| `record.cjs` + `overlay.js` | Plays each scene in Chromium on Xvfb, draws cursor / step titles / key badges, screen-records with ffmpeg → `raw.mp4`, `timeline.json` |
| `mix.py` | Places each voice clip at its scene start, adds subtitles, encodes the final MP4s |
| `paste.txt`, `working.html` | The sample Excel enquiry and the "working" photo used in the demo |

## Re-make the video

Needs `xvfb-run`, `ffmpeg` (with libass), Playwright's Chromium and an ElevenLabs key (`xi-api-key`).

```bash
npm install && npx vite build
cd docs/tutorial-video
python3 tts.py
node -e "require('playwright').chromium.launch().then(b=>b.newPage().then(p=>p.goto('file://'+process.cwd()+'/working.html').then(()=>p.setViewportSize({width:800,height:600})).then(()=>p.screenshot({path:'working.png'}))).then(()=>b.close()))"
./reset.sh
xvfb-run -a -s "-screen 0 1536x864x24" node record.cjs
python3 mix.py
```

Test run without recording (fast, screenshots per scene in `shots/`): `mkdir -p shots && DRY=1 FAST=0.3 xvfb-run -a -s "-screen 0 1536x864x24" node record.cjs`.
