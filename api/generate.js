// File: /api/generate.js
// Deploys on Vercel as a serverless function. Keeps your API key **secret**.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { who = '', situation = '', vibe = 'funny', style = '' } = req.body || {};

    // Basic validation + guardrails
    const bad = (s) => /hate|violence|threat|harass|underage|illegal|self-harm|suicide/i.test(s || '');
    if (bad(who) || bad(situation) || bad(style)) {
      return res.status(400).json({ error: 'Please keep it respectful and safe.' });
    }

    const system = `You are Rizzify, an AI wingman. Generate short, respectful, flirty or funny messages. 
Rules: 
- Stay under 220 characters each. 
- Avoid explicit content, personal data requests, or manipulative language. 
- Match the requested vibe and context.
- Output only JSON with an array of strings (key: ideas).`;

    const user = JSON.stringify({ who, situation, vibe, style });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY on server.' });
    }

    // Call OpenAI – you can switch model to anything you prefer that's available to your key
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.9,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Create 3 distinct options. Return JSON: {"ideas":["..."]}. Input: ${user}` }
        ]
      })
    });

    if (!completion.ok) {
      const text = await completion.text();
      console.error('OpenAI error:', text);
      return res.status(500).json({ error: 'Upstream error' });
    }

    const json = await completion.json();
    const raw = json.choices?.[0]?.message?.content?.trim() || '';

    let ideas = [];
    try {
      const parsed = JSON.parse(raw);
      ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0,3) : [];
    } catch (e) {
      // Fallback: extract lines
      ideas = raw.split(/\n+/).map(s=>s.replace(/^[\-*\d.\s]+/, '')).filter(Boolean).slice(0,3);
    }

    // Final safety filter (client-facing)
    ideas = ideas.map(x => String(x).slice(0,220)).filter(x => !bad(x));

    return res.status(200).json({ ideas });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server crashed' });
  }
}
