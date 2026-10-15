// The lessons: data/index.json lists every section and page; each section's text,
// positions and narration are in data/s_X_Y.json, loaded when first needed.

export const course = { sections: [], flat: [], topics: [], info: null };
const loaded = new Map();       // file -> Promise of section JSON

export async function loadCourse() {
  const r = await fetch("data/index.json");
  const idx = await r.json();
  course.info = idx;
  const flat = [];
  flat.figIndex = new Map();
  for (const s of idx.sections) {
    const sec = { section: s.section, title: s.title, chapter: s.chapter, file: s.file, first: flat.length, topics: [] };
    let k = 0;
    s.topics.forEach(([title, n], ti) => {
      const topic = { title: title.replace(/\.$/, ""), section: s.section, first: flat.length, size: n,
        index: course.topics.length, num: "" };
      course.topics.push(topic);
      sec.topics.push(topic);
      for (let j = 0; j < n; j++, k++) {
        const fig = s.figs[k];
        if (j === 0) topic.num = fig.split(".").slice(0, 3).join(".");
        const p = { fig, playable: s.play[k] === "1", section: s.section, sectionTitle: s.title, file: s.file,
          topic: topic.index, topicTitle: topic.title, inTopic: j, topicSize: n, flatIndex: flat.length, posInFile: [ti, j] };
        flat.figIndex.set(fig, flat.length);
        flat.push(p);
      }
    });
    sec.last = flat.length - 1;
    course.sections.push(sec);
  }
  course.flat = flat;
  return course;
}

function sectionData(file) {
  if (!loaded.has(file)) {
    loaded.set(file, fetch("data/" + file).then((r) => {
      if (!r.ok) throw new Error("couldn't load " + file);
      return r.json();
    }).catch((e) => { loaded.delete(file); throw e; }));
  }
  return loaded.get(file);
}

// Everything about one page: what's in the index plus the section file's details.
export async function page(i) {
  const p = course.flat[i];
  const sec = await sectionData(p.file);
  const [ti, j] = p.posInFile;
  return Object.assign({}, sec.topics[ti].positions[j], p);
}

// Load the next section in the background so Next is instant.
export function prefetch(i) {
  const p = course.flat[i];
  if (p) sectionData(p.file).catch(() => {});
}

// The recording names used anywhere in a section (for saving its narration ahead of time).
export async function sectionRecordings(section) {
  const sec = course.sections.find((s) => s.section === section);
  if (!sec) return [];
  const d = await sectionData(sec.file);
  const names = [];
  for (const t of d.topics) for (const p of t.positions) for (const s of p.segments || []) if (s.au) names.push(s.au);
  return names;
}
