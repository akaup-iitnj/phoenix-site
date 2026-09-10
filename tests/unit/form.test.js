const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../src/lib/form.js');

test('validEmail accepts ordinary addresses', () => {
  for (const e of ['dean@college.edu', 'first.last@sub.domain.org', '  padded@example.com  ', 'x+tag@iitnj.edu'])
    assert.equal(F.validEmail(e), true, e);
});

test('validEmail rejects malformed addresses', () => {
  for (const e of ['', 'no-at-sign', 'two@@at.com', 'space in@x.com', 'nodot@host', 'trailing@dot.', 'a@b.c', null, undefined])
    assert.equal(F.validEmail(e), false, String(e));
});

test('validEmail rejects absurdly long input', () => {
  assert.equal(F.validEmail('a'.repeat(250) + '@x.com'), false);
});

test('validate reports each missing field', () => {
  assert.deepEqual(F.validate({ name: '', email: '' }).errors, { name: 'Add your name.', email: 'Add a working email address.' });
  assert.deepEqual(F.validate({ name: 'Ash', email: 'bad' }).errors, { email: 'Add a working email address.' });
  assert.deepEqual(F.validate({ name: '   ', email: 'ok@x.edu' }).errors, { name: 'Add your name.' });
  assert.equal(F.validate({ name: 'Ash Kaup', email: 'akaup@iitnj.edu' }).ok, true);
});

test('firstName takes the first word and trims whitespace', () => {
  assert.equal(F.firstName('  Ashray   Kaup '), 'Ashray');
  assert.equal(F.firstName('Ren'), 'Ren');
});

test('buildBody maps to Google Form entry fields when configured', () => {
  const body = F.buildBody({ nameField: 'entry.111', emailField: 'entry.222', sourceField: 'entry.333', source: 'phoenixindustriallabs.com' },
    { name: ' Ash Kaup ', email: 'akaup@iitnj.edu' });
  const p = new URLSearchParams(body);
  assert.equal(p.get('entry.111'), 'Ash Kaup');
  assert.equal(p.get('entry.222'), 'akaup@iitnj.edu');
  assert.equal(p.get('entry.333'), 'phoenixindustriallabs.com');
  assert.equal(p.has('name'), false);
});

test('buildBody falls back to generic field names', () => {
  const p = new URLSearchParams(F.buildBody({ source: 'test' }, { name: 'A', email: 'a@b.co' }));
  assert.deepEqual([...p.keys()].sort(), ['email', 'name', 'source']);
});

test('buildMailto produces an encoded mailto link', () => {
  const href = F.buildMailto('akaup@iitnj.edu', { name: 'Ash Kaup', email: 'ash@college.edu' }, 'phoenixindustriallabs.com');
  assert.ok(href.startsWith('mailto:akaup@iitnj.edu?subject='));
  const q = new URLSearchParams(href.split('?')[1]);
  assert.equal(q.get('subject'), 'Walkthrough request from Ash Kaup');
  assert.equal(q.get('body'), 'Name: Ash Kaup\nEmail: ash@college.edu\nSource: phoenixindustriallabs.com');
});

test('validate caps the name at 80 characters and says so', () => {
  const long = 'A'.repeat(81);
  assert.deepEqual(F.validate({ name: long, email: 'ok@x.edu' }).errors, { name: 'Keep the name under 80 characters.' });
  assert.equal(F.validate({ name: 'A'.repeat(80), email: 'ok@x.edu' }).ok, true);
  assert.equal(F.validName('José Álvarez-Núñez 李'), true, 'non-ASCII names are fine');
});

test('validEmail stays fast on hostile input (no catastrophic backtracking)', () => {
  const t = Date.now();
  for (const bad of ['a@' + 'b.'.repeat(120) + 'c', 'a'.repeat(200) + '@' + 'b'.repeat(50), '@'.repeat(250), 'a@' + '.'.repeat(250)])
    F.validEmail(bad);
  assert.ok(Date.now() - t < 200, 'validation of 4 hostile strings took under 200 ms');
});

test('buildBody encodes control characters and never breaks the form encoding', () => {
  const p = new URLSearchParams(F.buildBody({ nameField: 'entry.1', emailField: 'entry.2' }, { name: 'Ash\r\nBcc: x@y.z&entry.9=hack', email: 'a@b.co' }));
  assert.equal(p.get('entry.1'), 'Ash Bcc: x@y.z&entry.9=hack');
  assert.equal(p.get('entry.9'), null);
});
