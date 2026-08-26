// ============================================================
// POST /api/nova
// Body: { messages: [{role, content}], finance: {...} }
//
// Nova, the finance dashboard's built-in money coach. Grounds every
// reply in the finance JSON snapshot the client sends (net worth,
// subscriptions, incoming orders, wishlist), replies in French to
// match the dashboard's UI, and never invents figures.
//
// Keeps ANTHROPIC_API_KEY server-side only (never sent to the browser).
// ============================================================
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });

  const { messages, finance } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages required' });

  const system =
    "You are Nova, the built-in money coach for a personal net-worth dashboard. "
    + "A JSON snapshot of the user's own finances is included below — use it to give "
    + "specific, grounded, practical guidance about their money.\n\n"
    + "How to respond:\n"
    + "- Always reply in French — the dashboard's UI and the user are French-speaking. Use "
    + "the polite \"vous\" register, matching the rest of the dashboard's tone.\n"
    + "- Be warm, direct and concise. Lead with the answer, then a short reason. A few "
    + "sentences or a tight bulleted list — never an essay.\n"
    + "- Ground every claim in their actual data. Quote real figures (with the currency "
    + "shown) instead of speaking in generalities. If the snapshot doesn't contain what "
    + "you'd need, say so and ask one focused follow-up question.\n"
    + "- Net-worth amounts in the snapshot are stored in CHF; \"currency\" is the user's "
    + "display currency. Subscriptions list a cost and billing period; orders are incoming "
    + "purchases; wishlist items are things they're saving for.\n"
    + "- You give general financial education and guidance, not regulated investment, tax "
    + "or legal advice. For big or irreversible money decisions, remind them to confirm "
    + "with a qualified professional.\n"
    + "- Never invent balances, holdings or transactions that aren't in the snapshot.\n"
    + "- Reply with your final answer only — no internal reasoning, no \"Based on...\" preamble.\n\n"
    + "Finance snapshot (JSON):\n" + JSON.stringify(finance || {});

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        system: system,
        messages: messages
      })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || ('Anthropic API error (' + r.status + ')');
      return res.status(502).json({ error: msg });
    }

    const text = (data.content || [])
      .filter(b => b && b.type === 'text').map(b => b.text).join('').trim();

    return res.status(200).json({ text: text || '(pas de réponse)' });
  } catch (e) {
    return res.status(500).json({ error: 'request failed: ' + (e && e.message ? e.message : String(e)) });
  }
}
