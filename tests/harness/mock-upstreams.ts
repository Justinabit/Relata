/**
 * LOCAL QA HARNESS ONLY. Not imported by the app and never started by `npm start`.
 * It replaces global fetch for OpenAlex, Crossref and Gemini with labelled fixtures so the UI can be exercised
 * end to end when live OpenAlex/AI credentials are unavailable. Fixture titles are prefixed "[Fixture]" so they can
 * never be mistaken for real studies.
 */
export {};
process.env.GEMINI_API_KEY = 'fixture-key';
process.env.OPENALEX_API_KEY = 'fixture-key';
process.env.PORT = process.env.PORT ?? '8790';
process.env.NODE_ENV = 'production';
process.env.CONTACT_EMAIL = 'hello@example.invalid';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const words = 'Participants completed a survey about study habits and attention, and the authors report that heavier daily use was associated with lower self-reported concentration during coursework, while moderate use showed little association in this sample of undergraduates from three universities.';
const inv = (t: string) => Object.fromEntries(t.split(' ').map((w, i) => [w, [i]]));
const topicsPool = ['Social Media Impact', 'Education Technology', 'Adolescent Mental Health', 'Learning Analytics', 'Digital Literacy'];

const work = (n: number) => ({
  id: `https://openalex.org/W${3000000000 + n}`,
  doi: `https://doi.org/10.9999/fixture.${n}`,
  title: `[Fixture] Social media use and academic outcomes, record ${n}`,
  publication_year: 2026 - (n % 10),
  publication_date: `${2026 - (n % 10)}-0${(n % 9) + 1}-15`,
  type: n % 7 === 0 ? 'review' : 'article',
  cited_by_count: (n * 37) % 410,
  open_access: { is_oa: n % 3 === 0, oa_status: n % 3 === 0 ? 'gold' : 'closed', oa_url: n % 3 === 0 ? `https://example.invalid/oa/${n}` : null },
  primary_location: { source: { display_name: n % 2 ? 'Journal of Fixture Studies' : 'Fixture Review of Education' }, landing_page_url: null },
  authorships: [{ author: { display_name: 'Ana Reyes', orcid: n % 4 ? null : 'https://orcid.org/0000-0000-0000-0001' } }, { author: { display_name: n % 2 ? 'Jon Cruz' : 'Mei Lin' } }],
  topics: [topicsPool[n % 5], topicsPool[(n + 2) % 5]].map((t, i) => ({ id: `https://openalex.org/T${n % 5}${i}`, display_name: t })),
  abstract_inverted_index: n % 6 === 0 ? null : inv(words),
});

globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url.startsWith('https://api.openalex.org/works')) {
    const u = new URL(url);
    const per = Math.min(Number(u.searchParams.get('per_page') ?? 25), 50);
    return json({ meta: { count: 4821 }, results: Array.from({ length: per }, (_, i) => work(i + 1)) });
  }
  if (url.startsWith('https://api.crossref.org/works')) {
    const dois = [...(new URL(url).searchParams.get('filter') ?? '').matchAll(/doi:([^,]+)/g)].map((m) => m[1]);
    const items = dois.filter((d) => !d.endsWith('.3')).map((d) => {
      const n = Number(d.split('.').pop());
      return {
        DOI: d, title: [`[Fixture] Social media use and academic outcomes, record ${n}`], author: [{ given: 'Ana', family: 'Reyes' }, { given: 'Jon', family: 'Cruz' }],
        issued: { 'date-parts': [[n === 2 ? 2024 : 2026 - (n % 10), ((n % 9) + 1), 15]] }, 'container-title': [n % 2 ? 'Journal of Fixture Studies' : 'Fixture Review of Education'],
        publisher: 'Fixture Press', type: 'journal-article', 'is-referenced-by-count': 3,
      };
    });
    return json({ message: { items, 'total-results': items.length } });
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    const body = JSON.stringify(JSON.parse(init.body));
    let out: unknown;
    if (body.includes('topic-analysis component')) {
      out = {
        mainTopic: 'Social media and academic performance',
        definition: 'Social media use refers to time spent on online platforms for communication and content sharing. Academic performance describes how well students meet educational goals such as grades.',
        simpleExplanation: 'This topic asks whether the way students use social networks is linked to how well they do in school.',
        academicField: 'Educational Psychology', relatedFields: ['Communication Studies', 'Public Health'],
        keywords: ['social media', 'academic performance', 'student engagement', 'attention', 'screen time'], synonyms: ['online social networks', 'student achievement'],
        concepts: [{ term: 'Media multitasking', explanation: 'Switching between media and study tasks at the same time.' }, { term: 'Self-regulation', explanation: 'A learner\'s ability to manage attention and behaviour toward goals.' }],
        relatedTopics: [
          { name: 'Digital distraction', definition: 'Interruptions from devices that pull attention from a task.', relevance: 'Distraction is a proposed pathway between social media use and coursework.' },
          { name: 'Adolescent mental health', definition: 'Emotional and psychological wellbeing during adolescence.', relevance: 'Wellbeing is often examined alongside social media use.' },
          { name: 'Learning analytics', definition: 'Collection and analysis of learner data to understand learning.', relevance: 'Used to measure study behaviour objectively.' },
        ],
        researchDirections: ['Could examine whether platform type changes the association with study time.', 'Could compare self-reported and logged usage.'],
        searchQueries: ['social media academic performance', 'student social networking use grades', 'screen time student attention'],
      };
    } else {
      const refs = [...body.matchAll(/\\"ref\\":\\"(s\d+)\\"/g)].map((m) => m[1]);
      out = { items: [...new Set(refs)].map((ref) => ({ ref, relevance: 'Examines the link between student social media use and coursework outcomes, which matches your topic.', summary: 'Reports a survey of undergraduates relating daily social media use to self-reported concentration during coursework.', keyFindings: ['Heavier daily use was associated with lower self-reported concentration.'] })) };
    }
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] });
  }
  throw new Error('harness: unexpected fetch ' + url);
}) as typeof fetch;

await import('../../server/index.js');
