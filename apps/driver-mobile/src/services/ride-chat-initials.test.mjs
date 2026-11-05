import test from 'node:test';
import assert from 'node:assert/strict';
import { contactInitials } from './ride-chat.ts';

test('contactInitials uses the first and last word, upper-cased', () => {
  assert.equal(contactInitials('Subrata Ghosh'), 'SG');
  assert.equal(contactInitials('  rahul   kumar  sharma '), 'RS');
  assert.equal(contactInitials('Meera'), 'M');
  assert.equal(contactInitials('   '), '?');
});
