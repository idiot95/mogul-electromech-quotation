// Put a rendered video into its LMS lesson.
//
//   node training-videos/lms/publish.js "training-videos/out/F1 v1.0 - Find your way around the ERP.mp4"
//
// The video code (F1, S5 …) and version are read from the file's .json manifest written by engine.js.
// The file is uploaded as a PRIVATE file attached to the lesson, so only signed-in users who can
// open the lesson can play it. The previous version's file is deleted after the new one is in place.
'use strict';
const fs = require('fs');
const path = require('path');
const erp = require('./erp');

const file = path.resolve(process.argv[2] || '');
if (!fs.existsSync(file)) { console.error('usage: node publish.js <video.mp4>'); process.exit(2); }
const man = JSON.parse(fs.readFileSync(file.replace(/\.mp4$/, '.json')));
if (!man.release && !process.argv.includes('--allow-draft')) {
  console.error(`${path.basename(file)} is a DRAFT render. Render with --release first (or pass --allow-draft for staging tests).`);
  process.exit(2);
}

const lesson = erp.list('Course Lesson', [['title', 'like', `${man.code} · %`]], ['name', 'title', 'content'])[0];
if (!lesson) { console.error(`No LMS lesson for ${man.code}. Run provision.js --apply first.`); process.exit(2); }

const up = erp.upload(file, { doctype: 'Course Lesson', docname: lesson.name });
console.log(`uploaded ${path.basename(file)} -> ${up.file_url} (private: ${up.is_private})`);

const blocks = [
  { type: 'upload', data: { file_url: up.file_url, file_type: 'mp4' } },
  { type: 'paragraph', data: { text: `<b>Version ${man.version}</b> · ${man.release ? 'released' : 'draft'} ${man.date} · recorded on ERPNext ${man.erp}` } },
  { type: 'paragraph', data: { text: 'Confidential: for Hatim Carbon employees only. Do not download or share outside the company.' } },
  ...(man.scenes || []).filter(s => s.say).length ? [{ type: 'paragraph', data: { text: '<b>What this video covers</b>' } }] : [],
  ...(man.scenes || []).slice(2, -1).map(s => ({ type: 'paragraph', data: { text: s.say } })),
];
erp.update('Course Lesson', lesson.name, { content: JSON.stringify({ time: Date.now(), blocks, version: '2.29.0' }) });
console.log(`lesson "${lesson.title}" now shows v${man.version}`);

// Remove older video files attached to this lesson.
for (const f of erp.list('File', [['attached_to_doctype', '=', 'Course Lesson'], ['attached_to_name', '=', lesson.name], ['file_url', '!=', up.file_url], ['file_name', 'like', '%.mp4']], ['name', 'file_url'])) {
  erp.remove('File', f.name);
  console.log(`removed old file ${f.file_url}`);
}
