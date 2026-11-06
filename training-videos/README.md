# ERP training videos

Scripted, narrated screen recordings of the Hatim Carbon ERP. Each video in the
[training plan](https://claude.ai/artifact/4jjPcckvEMk1DJoZX5bYJa) has one script
in `scripts/` (code = file name, e.g. `F1.js`). The engine plays the script in a
real Chromium window, records the screen, voices the narration and burns in captions.

## How a video is made

1. **Voice** — every scene's `say` text is spoken by **Kokoro, voice `af_heart`** (the house
   voice: American female, offline, free, Apache-2.0) and cached in `.cache/`. Scene lengths are
   known before recording. Other providers: `piper`, `omnivoice`, `elevenlabs`, `azure`
   (`TTS_PROVIDER`, see the top of `engine.js`).
2. **Record** — Chromium runs fullscreen at 1920×1080 on a virtual display (Xvfb) and
   ffmpeg captures it. A drawn cursor, click ripples and amber highlight boxes are
   injected into the page. Each scene waits until its narration has finished.
3. **Mix** — narration clips are placed at each scene's start time, captions (`.srt`)
   are generated and burned in, and the result is encoded to H.264/AAC MP4.

Output: `out/<code> - <title>.mp4` plus a matching `.srt`.

## Run

Once: install Kokoro and download the model and the Heart voice
(from [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)):

```bash
pip install kokoro-onnx soundfile
```

```bash
mkdir -p kokoro/onnx kokoro/voices && for f in onnx/model.onnx voices/af_heart.bin; do curl -sSL -o kokoro/$f https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/$f; done
```

Then render a video:

```bash
KOKORO_DIR=$PWD/kokoro ERP_URL=https://erpstaging.hatimcarbon.com node training-videos/engine.js training-videos/scripts/F1.js
```

Needs Node 18+, Playwright with Chromium, ffmpeg (with libass) and Xvfb.
The browser must already be signed in to `ERP_URL` (in the cloud session the
network proxy signs requests in).

## Writing a script

```js
module.exports = {
  code: 'S5', title: 'Create a Quotation',
  async warmup(h) { /* load pages off-camera so they open fast */ },
  scenes: [
    { card: { kicker: 'S5 · Sales', title: 'Create a Quotation', sub: '...' }, say: 'Intro…' },
    { say: 'Narration for this step…', async run(h, at) {
        await h.go('/desk/quotation/new');
        await at(3.0);                     // wait until 3 s into this scene's narration
        await h.click('[data-fieldname="party_name"] input');
        await h.type('DEMO-');
        await h.highlight('.form-layout', 2500);
    } },
  ],
};
```

Helpers: `go(route)`, `click(sel)`, `moveTo(sel)`, `type(text)`, `press(key)`,
`highlight(sel, ms)`, `scroll(dy)`, `blur(css)` / `blurText(regex)` for privacy.

## Rules for recording

- Record on **staging** only. Videos that create documents use records prefixed `DEMO-`.
- Blur customer names, phone numbers and prices that are not demo data.
- Spell acronyms the way they should be spoken (`E R P`, `I S O`) in `say` text.
