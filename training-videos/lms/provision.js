// Build the training structure in Frappe Learning (LMS) from catalogue.json. Safe to run again:
// existing courses, chapters and lessons are found by title and left in place.
//
//   node training-videos/lms/provision.js            # dry run: prints what it would create
//   node training-videos/lms/provision.js --apply    # creates it on ERP_URL (default: staging)
//
// Structure: one course per track (Foundations, Sales & CRM, …), one chapter per wave inside it,
// one lesson per video titled "<code> · <title>". Lessons start with a "video coming soon" note;
// publish.js puts the video in.
'use strict';
const path = require('path');
const erp = require('./erp');

const APPLY = process.argv.includes('--apply');
const cat = require(path.join(__dirname, '..', 'catalogue.json'));
const WAVES = { 1: 'Daily flows', 2: 'Stock, dispatch and production', 3: 'Quality, ISO and assets', 4: 'People and administration' };

const editor = blocks => JSON.stringify({ time: Date.now(), blocks, version: '2.29.0' });
const para = text => ({ type: 'paragraph', data: { text } });

function lessonPlaceholder(v) {
  return editor([
    para(`<b>${v.code} · ${v.title}</b>`),
    para(`Who should watch: ${v.audience}. Length: about ${v.minutes} minutes.`),
    para('<i>Video coming soon.</i>'),
  ]);
}

function main() {
  console.log(`LMS provisioning on ${erp.BASE} (${APPLY ? 'APPLY' : 'dry run'})`);
  if (!erp.doctypeExists('LMS Course')) {
    console.error('Frappe Learning is not installed on this site. Install it first (see training-videos/lms/README.md).');
    process.exit(2);
  }
  const me = erp.me();
  const plan = { courses: 0, chapters: 0, lessons: 0 };

  for (const tr of cat.tracks) {
    const videos = cat.videos.filter(v => v.code.replace(/\d+$/, '') === tr.prefix);
    if (!videos.length) continue;
    const courseTitle = `${tr.title} · HCC ERP training`;

    let course = erp.list('LMS Course', [['title', '=', courseTitle]])[0];
    if (!course) {
      plan.courses++;
      console.log(`+ course  ${courseTitle} (${videos.length} videos, ${videos.reduce((a, v) => a + v.minutes, 0)} min)`);
      if (APPLY) course = erp.insert('LMS Course', {
        title: courseTitle,
        short_introduction: `${videos.length} short videos for ${tr.desks}. Confidential: for Hatim Carbon employees only.`,
        description: `<p>Training videos for <b>${tr.title}</b> in the Hatim Carbon ERP. Watch them in order; each lesson counts as done when the video has been watched to the end.</p><p>Confidential: for Hatim Carbon employees only. Do not share outside the company.</p>`,
        published: 1, tags: 'HCC ERP training', card_gradient: 'Green',
        instructors: [{ instructor: me }],
      });
    }

    const chapterRefs = [];
    for (const [w, title] of Object.entries(WAVES)) {
      const inWave = videos.filter(v => String(v.wave) === w);
      if (!inWave.length) continue;
      let chapter = course && erp.list('Course Chapter', [['course', '=', course.name], ['title', '=', title]])[0];
      if (!chapter) {
        plan.chapters++;
        console.log(`  + chapter ${title}`);
        if (APPLY) chapter = erp.insert('Course Chapter', { course: course.name, title });
      }
      const lessonRefs = [];
      for (const v of inWave) {
        const lt = `${v.code} · ${v.title}`;
        let lesson = chapter && erp.list('Course Lesson', [['chapter', '=', chapter.name], ['title', '=', lt]])[0];
        if (!lesson) {
          plan.lessons++;
          console.log(`    + lesson ${lt}`);
          if (APPLY) lesson = erp.insert('Course Lesson', { chapter: chapter.name, course: course.name, title: lt, content: lessonPlaceholder(v) });
        }
        if (lesson) lessonRefs.push({ lesson: lesson.name });
      }
      if (APPLY && chapter) erp.update('Course Chapter', chapter.name, { lessons: lessonRefs });
      if (chapter) chapterRefs.push({ chapter: chapter.name });
    }
    if (APPLY && course) erp.update('LMS Course', course.name, { chapters: chapterRefs });
  }
  console.log(`${APPLY ? 'Created' : 'Would create'}: ${plan.courses} courses, ${plan.chapters} chapters, ${plan.lessons} lessons.`);
}
main();
