// modules/ai/aiClient.js
// Minimal OpenAI-compatible chat client (works with LM Studio/local OpenAI servers)

/**
 * Generate a reply from an OpenAI-compatible API (default: LM Studio at http://localhost:1234/v1)
 * @param {Object} opts
 * @param {Array} opts.messages - OpenAI chat messages array
 * @param {string} [opts.model] - Model name
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.maxTokens=256]
 * @param {string} [opts.provider='openai'] - For future extension
 * @param {string} [opts.endpoint] - Base URL of API (e.g., http://localhost:1234/v1)
 * @param {string} [opts.apiKey] - API key if needed
 * @returns {Promise<string|null>} assistant text or null on failure
 */
export async function generateReply({ messages, model, temperature = 0.7, maxTokens = 256, provider = 'openai', endpoint, apiKey }) {
  try {
    const baseUrl = endpoint || process.env.LOCAL_OPENAI_URL || process.env.LMSTUDIO_URL || 'http://localhost:1234/v1';
    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';

    const body = {
      model: model || 'lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF',
      messages,
      temperature,
      max_tokens: maxTokens
    };

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.warn(`[aiClient] Bad response: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    // Basic safety: trim overly long responses
    return text.slice(0, 1800);
  } catch (err) {
    console.error('[aiClient] Error generating reply:', err);
    return null;
  }
}

export default { generateReply };
