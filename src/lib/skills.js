/* Skill tags for Journey moments, in IB vocabulary (Learner Profile,
 * ATL skills, CAS learning outcomes) so they mean the same thing to
 * teachers, students and universities. */

export const SKILL_GROUPS = [
  {
    id: 'cas',
    label: 'What it showed',
    skills: ['Leadership', 'Collaboration', 'Perseverance', 'Initiative', 'Challenge', 'Global engagement', 'Ethical choices']
  },
  {
    id: 'profile',
    label: 'Learner Profile',
    skills: ['Inquirer', 'Knowledgeable', 'Thinker', 'Communicator', 'Principled', 'Open-minded', 'Caring', 'Risk-taker', 'Balanced', 'Reflective']
  },
  {
    id: 'atl',
    label: 'ATL skills',
    skills: ['Thinking skills', 'Communication skills', 'Social skills', 'Self-management', 'Research skills']
  }
];

export const MAX_SKILLS = 5;

const BY_DOMAIN = {
  sport: ['Perseverance', 'Collaboration', 'Balanced'],
  service: ['Caring', 'Global engagement', 'Collaboration'],
  leadership: ['Leadership', 'Initiative', 'Communicator'],
  creative_arts: ['Risk-taker', 'Communicator', 'Reflective'],
  academic: ['Inquirer', 'Knowledgeable', 'Research skills'],
  co_curricular: ['Collaboration', 'Communicator', 'Self-management'],
  personal: ['Reflective', 'Balanced', 'Perseverance'],
  other: ['Reflective', 'Initiative', 'Communicator']
};

const BY_WORDS = [
  [/captain|lead|organis|organiz|head of|prefect|president/i, 'Leadership'],
  [/team|squad|group|together|partner/i, 'Collaboration'],
  [/volunteer|help|charity|donat|support|buddy|buddies|mentor/i, 'Caring'],
  [/debate|speech|present|perform|host|mun\b/i, 'Communicator'],
  [/research|investigat|experiment|survey|data/i, 'Research skills'],
  [/first time|new |tried|audition|trial|competition/i, 'Risk-taker'],
  [/injur|lost|setback|again|practice|training|hard/i, 'Perseverance'],
  [/start(ed)?|set up|founded|launch|idea/i, 'Initiative'],
  [/learn|realis|realiz|reflect/i, 'Reflective'],
  [/environment|climate|community|global|culture/i, 'Global engagement']
];

/* Two or three tags the student is likely to pick, from the area and the
 * words in their moment. They confirm with a tap. */
export function suggestSkills({ domain, entry_type, title, description, reflection }) {
  const text = `${title || ''} ${description || ''} ${reflection || ''}`;
  const picks = [];
  BY_WORDS.forEach(([pattern, skill]) => {
    if (pattern.test(text) && !picks.includes(skill)) picks.push(skill);
  });
  (BY_DOMAIN[domain] || BY_DOMAIN.other).forEach(skill => {
    if (!picks.includes(skill)) picks.push(skill);
  });
  if (['award', 'achievement'].includes(entry_type) && !picks.includes('Perseverance')) picks.push('Perseverance');
  return picks.slice(0, 3);
}

/* Guiding questions for "Help me write". Tapping one adds the starter. */
export const STORY_PROMPTS = [
  { q: 'What happened?', starter: 'On ' },
  { q: 'What was your role?', starter: 'My role was to ' },
  { q: 'Who was involved?', starter: 'I worked with ' },
  { q: 'What was the result?', starter: 'In the end, ' }
];

export const REFLECTION_PROMPTS = [
  { q: 'What did you learn?', starter: 'I learnt that ' },
  { q: 'What was hard, and how did you handle it?', starter: 'The hardest part was ' },
  { q: 'What would you do differently?', starter: 'Next time I would ' },
  { q: 'How will you use this next?', starter: 'I will use this when ' }
];

const DOMAIN_LABEL = {
  academic: 'Academic',
  sport: 'Sport',
  creative_arts: 'Creative arts',
  leadership: 'Leadership',
  service: 'Service',
  co_curricular: 'Co-curricular',
  personal: 'Personal growth',
  other: 'Other'
};

/* Skill bars for the CV: tagged skills if there are any; until students
 * start tagging, the areas of their moments are counted instead. */
export function skillCounts(entries, limit = 5) {
  const counts = new Map();
  const add = key => counts.set(key, (counts.get(key) || 0) + 1);
  let tagged = false;

  (entries || []).forEach(entry => {
    const list = Array.isArray(entry.skills)
      ? entry.skills
      : String(entry.skills || '').split(',').map(x => x.trim()).filter(Boolean);
    if (list.length) tagged = true;
    list.forEach(skill => add(skill.charAt(0).toUpperCase() + skill.slice(1)));
  });

  if (!tagged) {
    (entries || []).forEach(entry => entry.domain && add(DOMAIN_LABEL[entry.domain] || entry.domain));
  }

  const rows = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
  const max = rows[0]?.count || 1;
  return { mode: tagged ? 'skills' : 'areas', rows: rows.map(row => ({ ...row, share: row.count / max })) };
}
