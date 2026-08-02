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

async function callLLM({ messages, tools }) {
  const cfg = getLLMConfig();
  const headers = buildHeaders(cfg.baseUrl, cfg.apiKey);

  const body = {
    model:             cfg.model,
    messages,
    temperature:       cfg.temperature,
    max_tokens:        cfg.maxTokens,
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

module.exports = { callLLM, pingLLM, fetchModels, getLLMConfig, LLMUnavailableError };
