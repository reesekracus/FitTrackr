/**
 * FitTrackr — Anthropic API proxy
 *
 * Keeps the API key server-side so it never ships to the browser.
 * Set ANTHROPIC_API_KEY in Netlify → Site Settings → Environment Variables.
 */

export default async (req, context) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured. Add it in Netlify → Site Settings → Environment Variables.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.text();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Proxy error', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config = { path: '/api/anthropic' };
