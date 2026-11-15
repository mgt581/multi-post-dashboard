import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../uploadimages.html', import.meta.url), 'utf8');
const grab = (name) => html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`))[0];
const src = [grab('extractHashtags'), 'const MAX_FACEBOOK_HASHTAGS = 8;', grab('buildFacebookCaption')].join('\n');
const buildFacebookCaption = new Function(`${src}; return buildFacebookCaption;`)();

test('hashtags already in the description are not posted again', () => {
  const description = 'Post everywhere with MultiPost.\n\n#MultiPost #socialmedia #GooglePlay';
  const caption = buildFacebookCaption(description, '#MultiPost #socialmedia #GooglePlay #YouTube');
  assert.equal((caption.match(/#MultiPost/gi) || []).length, 1);
  assert.equal((caption.match(/#socialmedia/gi) || []).length, 1);
  assert.match(caption, /#YouTube/);
});

test('repeated tags inside the description collapse to one and are capped', () => {
  const tags = '#a #b #c #d #e #f #g #h #i #j';
  const caption = buildFacebookCaption(`Text. #MultiPost #MultiPost #multipost`, tags);
  assert.equal((caption.match(/#multipost/gi) || []).length, 1);
  assert.equal((caption.match(/#\w+/g) || []).length, 8);
});

test('SEO keywords are never published', () => {
  const caption = buildFacebookCaption('Text.\nKeywords: MultiPost, social media', '#MultiPost');
  assert.doesNotMatch(caption, /Keywords:/i);
  assert.match(caption, /Text\./);
});
