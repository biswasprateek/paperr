const axios = require('axios');
const { getDb } = require('../db/db');

class LLMUnavailableError extends Error {
  constructor(baseUrl) {
    super(`Cannot connect to LLM at ${baseUrl}. Is Ollama/LM Studio running?`);
    this.code = 'LLM_UNAVAILABLE';
  }
}

function getLLMConfig() {
  // Defaults from .env
  let config = {
    baseUrl:          process.env.LLM_BASE_URL  || 'http://localhost:11434',
    apiKey:           process.env.LLM_API_KEY   || '',
    model:            process.env.LLM_MODEL     || 'llama3',
    temperature:      0.7,
    maxTokens:        2048,
    contextWindow:    8096,
    topP:             1.0,
    frequencyPenalty: 0.0,
    presencePenalty:  0.0,
  };

  try {
    const db = getDb();
    // Prefer llm_configurations (active row), fall back to legacy llm_settings
    const row = db.prepare('SELECT * FROM llm_configurations WHERE is_active = 1 ORDER BY id LIMIT 1').get()
              || db.prepare('SELECT * FROM llm_settings WHERE id = 1').get();
    if (row) {
      if (row.base_url)                  config.baseUrl          = row.base_url;
      if (row.api_key)                   config.apiKey           = row.api_key;
      if (row.model)                     config.model            = row.model;
      if (row.temperature        != null) config.temperature     = row.temperature;
      if (row.max_tokens         != null) config.maxTokens       = row.max_tokens;
      if (row.context_window     != null) config.contextWindow   = row.context_window;
      if (row.top_p              != null) config.topP            = row.top_p;
      if (row.frequency_penalty  != null) config.frequencyPenalty = row.frequency_penalty;
      if (row.presence_penalty   != null) config.presencePenalty  = row.presence_penalty;
    }
  } catch {
    // DB not ready yet — fall back to env defaults
  }

  return config;
}

function buildHeaders(baseUrl, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'http://localhost:3000';
    headers['X-Title'] = 'paperr';
  }
  return headers;
}

// True if litert-lm's connection died mid-response rather than the server
// being genuinely down — e.g. it was reloading a model when the request hit
// it, so the socket got dropped mid-write and the client sees either a
// reset or a truncated/malformed HTTP response. Worth one retry; a real
// LLM_UNAVAILABLE (server not running at all) fails the same way every time.
function isTransientConnectionError(err) {
  return err.code === 'ECONNRESET' || /^HPE_/.test(err.code) || /parse error/i.test(err.message || '');
}

// Small local models hard-fail (HTTP 500 "Input token ids are too long") when the
// rendered prompt exceeds their KV cache — gemma4-e2b defaults to 4096, and the
// tool schemas alone are ~2900 of that. So every request gets budgeted here, the one
// place all callers route through, instead of each caller guessing.
//
// ponytail: chars/4 estimate rather than a real tokenizer. CHARS_PER_TOKEN is the
// calibration knob — lower it if a model's tokenizer runs denser than English prose.
const CHARS_PER_TOKEN = 4;
const MIN_OUTPUT_TOKENS = 256;

const estimate = (v) =>
  Math.ceil((typeof v === 'string' ? v : JSON.stringify(v ?? '')).length / CHARS_PER_TOKEN);

// content + any tool_calls payload + role/delimiter framing
const messageTokens = (m) => estimate(m.content) + (m.tool_calls ? estimate(m.tool_calls) : 0) + 4;

// Trims history to fit the model's context window and returns the output allowance
// left over. The system message always survives. Any single oversized message (a
// big tool result) is capped to half the budget first, so it cannot squeeze out the
// assistant turn that explains it, and only then are the oldest turns dropped.
function fitContext(messages, tools, { contextWindow, maxTokens }) {
  const system = messages[0]?.role === 'system' ? messages.slice(0, 1) : [];
  const fixed = (tools?.length ? estimate(tools) : 0)
              + (system.length ? messageTokens(system[0]) : 0);
  const room = contextWindow - fixed - MIN_OUTPUT_TOKENS;
  const perMessageCap = Math.floor(room / 2);

  const capped = messages.slice(system.length).map((m) => {
    if (typeof m.content !== 'string' || perMessageCap <= 0) return m;
    if (estimate(m.content) <= perMessageCap) return m;
    return { ...m, content: m.content.slice(0, perMessageCap * CHARS_PER_TOKEN) + '\n…[truncated]' };
  });

  let left = room;
  const kept = [];
  for (let i = capped.length - 1; i >= 0; i--) {
    const cost = messageTokens(capped[i]);
    if (cost > left) break; // everything older than this is dropped too
    kept.unshift(capped[i]);
    left -= cost;
  }

  // A tool result whose assistant tool_calls message got dropped is an orphan, and
  // OpenAI-compatible servers reject it outright.
  while (kept.length && kept[0].role === 'tool') kept.shift();

  const used = kept.reduce((n, m) => n + messageTokens(m), 0);
  return {
    messages: [...system, ...kept],
    maxTokens: Math.max(MIN_OUTPUT_TOKENS, Math.min(maxTokens, contextWindow - fixed - used)),
  };
}

async function callLLM({ messages, tools }) {
  const cfg = getLLMConfig();
  const headers = buildHeaders(cfg.baseUrl, cfg.apiKey);
  const fitted = fitContext(messages, tools, cfg);

  const body = {
    model:             cfg.model,
    messages:          fitted.messages,
    temperature:       cfg.temperature,
    max_tokens:        fitted.maxTokens,
    top_p:             cfg.topP,
    frequency_penalty: cfg.frequencyPenalty,
    presence_penalty:  cfg.presencePenalty,
  };

  // Ollama uses num_ctx for context window; pass it as an option if set
  if (cfg.contextWindow) {
    body.options = { num_ctx: cfg.contextWindow };
  }

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await axios.post(`${cfg.baseUrl}/v1/chat/completions`, body, {
        headers,
        timeout: 120000,
        insecureHTTPParser: true, // litert-lm's serve command sends bare-LF line endings
      });
      return response.data.choices[0];
    } catch (err) {
      if (err.code === 'ECONNREFUSED') throw new LLMUnavailableError(cfg.baseUrl);
      if (attempt < MAX_ATTEMPTS && isTransientConnectionError(err)) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      if (err.code === 'ECONNRESET') throw new LLMUnavailableError(cfg.baseUrl);
      throw err;
    }
  }
}

async function pingLLM() {
  const cfg = getLLMConfig();
  const headers = buildHeaders(cfg.baseUrl, cfg.apiKey);

  try {
    await axios.get(`${cfg.baseUrl}/v1/models`, { headers, timeout: 10000, insecureHTTPParser: true });
    return { ok: true, baseUrl: cfg.baseUrl, model: cfg.model };
  } catch {
    try {
      await axios.post(
        `${cfg.baseUrl}/v1/chat/completions`,
        { model: cfg.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
        { headers, timeout: 15000, insecureHTTPParser: true }
      );
      return { ok: true, baseUrl: cfg.baseUrl, model: cfg.model };
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        throw new LLMUnavailableError(cfg.baseUrl);
      }
      throw err;
    }
  }
}

async function fetchModels(baseUrl, apiKey) {
  const headers = buildHeaders(baseUrl, apiKey);
  const response = await axios.get(`${baseUrl}/v1/models`, { headers, timeout: 10000, insecureHTTPParser: true });
  const data = response.data?.data || response.data?.models || [];
  // Normalize: each entry should have an `id` field
  return data
    .map(m => (typeof m === 'string' ? m : (m.id || m.name || String(m))))
    .filter(Boolean)
    .sort();
}

module.exports = { callLLM, pingLLM, fetchModels, getLLMConfig, fitContext, LLMUnavailableError };
