import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUserCommand, extractVoiceCommand } from './intentEngine';

test('routes hardware performance queries to system agent', () => {
  const parsed = analyzeUserCommand('Friday, show me my laptop performance and RAM usage');
  assert.equal(parsed.category, 'system_telemetry');
  assert.equal(parsed.agents.includes('system'), true);
  assert.equal(parsed.requiresConfirmation, false);
});

test('routes natural file searches to file agent', () => {
  const parsed = analyzeUserCommand('Friday, find the Excel file containing my monthly expenses');
  assert.equal(parsed.category, 'file_search');
  assert.equal(parsed.agents.includes('file'), true);
});

test('routes Google search requests to browser agent', () => {
  const parsed = analyzeUserCommand('Friday, search Google for the best Raspberry Pi AI projects');
  assert.equal(parsed.category, 'web_search');
  assert.equal(parsed.agents.includes('browser'), true);
});

test('enforces confirmation gate on destructive file commands', () => {
  const parsed = analyzeUserCommand('Friday, delete all files in my Downloads folder');
  assert.equal(parsed.category, 'sensitive_action');
  assert.equal(parsed.requiresConfirmation, true);
});

test('requires confirmation before scheduling new calendar meetings', () => {
  const parsed = analyzeUserCommand('Friday, schedule a meeting tomorrow at 10am');
  assert.equal(parsed.category, 'calendar_schedule');
  assert.equal(parsed.requiresConfirmation, true);
});

test('extracts command cleanly with punctuated wake word or direct mic mode', () => {
  const withWake = extractVoiceCommand('Hey, Friday, check laptop performance', 'Hey Friday', true);
  assert.equal(withWake.matched, true);
  assert.equal(withWake.command, 'check laptop performance');

  const direct = extractVoiceCommand('open chrome', 'Hey Friday', false);
  assert.equal(direct.matched, true);
  assert.equal(direct.command, 'open chrome');

  const ignored = extractVoiceCommand('open chrome', 'Hey Friday', true);
  assert.equal(ignored.matched, false);
});
