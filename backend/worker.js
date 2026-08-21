/**
 * Jarvis backend — forwards chat requests to the Anthropic API.
 *
 * The browser (your Jarvis app) never sees your API key. It calls this
 * Worker, and the Worker attaches the key (stored as a secret) before
 * talking to Anthropic.
 *
 * SETUP:
 *   1. Get an API key from https://console.anthropic.com/settings/keys
 *   2. Deploy this file as a Cloudflare Worker (see README.md in this
 *      folder for exact steps).
 *   3. Set the secret:  wrangler secret put ANTHROPIC_API_KEY
 *   4. Update ALLOWED_ORIGIN below to match where your Jarvis app is hosted.
 *   5. Copy the Worker's URL into API_ENDPOINT in index.html.
 */

// Restrict which site is allowed to call this Worker.
// Set to your app's exact URL once deployed, e.g. "https://jarvis-yourname.netlify.app"
// Use "*" temporarily while testing, then lock it down.
const ALLOWED_ORIGIN = "*";

const SYSTEM_PROMPT =
  "You are J.A.R.V.I.S., Tony Stark's AI assistant. Respond with the wit, " +
  "composure, and dry British formality of the character — address the " +
  "user as \"sir\" or \"madam\" naturally, be concise and useful, and " +
  "never break character or mention that you are Claude or an AI language " +
  "model. Keep responses conversational and fairly brief, suited to being " +
  "spoken aloud.";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Set it with: wrangler secret put ANTHROPIC_API_KEY" }),
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Cap history sent to keep costs/latency sane.
    const trimmed = messages.slice(-20);

    try {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: SYSTEM_PROMPT,
          messages: trimmed,
        }),
      });

      const data = await anthropicRes.json();

      if (!anthropicRes.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || "Anthropic API error" }), {
          status: anthropicRes.status,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Failed to reach Anthropic API" }), {
        status: 502,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }
  },
};
