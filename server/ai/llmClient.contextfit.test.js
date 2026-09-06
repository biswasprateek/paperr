// Context-budget self-check. Run: node server/ai/llmClient.contextfit.test.js
// Fails loudly if fitContext ever lets a request exceed the model's window —
// the bug that 500'd chat ("Input token ids are too long") while the agent
// playground, with its much smaller system prompt, stayed under the limit.
const assert = require('node:assert');
const { fitContext } = require('./llmClient');

const CHARS_PER_TOKEN = 4;
const est = (v) => Math.ceil((typeof v === 'string' ? v : JSON.stringify(v ?? '')).length / CHARS_PER_TOKEN);
const cost = (m) => est(m.content) + (m.tool_calls ? est(m.tool_calls) : 0) + 4;

const cfg = { contextWindow: 1000, maxTokens: 2048 };
const tools = [{ pad: 'x'.repeat(2000) }];          // ~500 tokens of schema
const system = { role: 'system', content: 'x'.repeat(400) };
const fixed = est(tools) + cost(system);

// Total the server would actually see: schemas + kept messages + room to reply.
const total = (out) => est(tools) + out.messages.reduce((n, m) => n + cost(m), 0) + out.maxTokens;

// 1. A long conversation is trimmed to fit, not sent whole.
const long = [system, ...Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'y'.repeat(200)}` }))];
const trimmed = fitContext(long, tools, cfg);
assert.ok(total(trimmed) <= cfg.contextWindow, `trimmed request must fit: ${total(trimmed)} > ${cfg.contextWindow}`);
assert.strictEqual(trimmed.messages[0], system, 'system message must survive');
assert.ok(trimmed.messages.length < long.length, 'older turns must be dropped');
assert.strictEqual(
  trimmed.messages.at(-1).content, long.at(-1).content, 'newest turn must survive intact');

// 2. A single oversized tool result is truncated, not dropped — and the assistant
//    turn that requested it survives alongside, so the model can still answer.
const parent = { role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'getTasks' } }] };
const huge = [system, { role: 'user', content: 'list my tasks' }, parent, { role: 'tool', tool_call_id: 't1', content: 'z'.repeat(20000) }];
const cut = fitContext(huge, tools, cfg);
assert.ok(total(cut) <= cfg.contextWindow, `truncated request must fit: ${total(cut)}`);
assert.ok(cut.messages.at(-1).content.includes('[truncated]'), 'oversized tool result is truncated');
assert.ok(cut.messages.at(-1).content.length < 20000, 'truncation actually shortened it');
assert.ok(cut.messages.some(m => m.tool_calls), 'the assistant turn that made the call is kept');

// 3. No orphaned tool result: if the assistant message carrying the tool_calls
//    got trimmed away, its tool replies must go too or the server rejects them.
const orphan = [system, { role: 'assistant', content: '', tool_calls: [{ id: 't1', pad: 'q'.repeat(3000) }] }, { role: 'tool', tool_call_id: 't1', content: 'result' }];
const fixedUp = fitContext(orphan, tools, cfg);
assert.ok(!fixedUp.messages.some((m, i) => m.role === 'tool' && fixedUp.messages[i - 1]?.role === 'system'),
  'a tool message must never directly follow the system message');

// 4. Output allowance is clamped to what is left, never the raw configured value.
assert.ok(trimmed.maxTokens < cfg.maxTokens, 'max_tokens is clamped to the remaining room');
assert.ok(trimmed.maxTokens >= 256, 'always leaves a usable reply allowance');

// 5. A short conversation is passed through untouched.
const short = [system, { role: 'user', content: 'hi' }];
assert.deepStrictEqual(fitContext(short, tools, cfg).messages, short, 'small requests are not modified');

console.log('fitContext context budget: all checks passed');
