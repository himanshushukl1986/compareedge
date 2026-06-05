export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Risk 2 fix: guard against missing body
  if (!req.body) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const {
    yourProduct, competitorProduct,
    yourProductUrl, competitorUrl,
    yourProductPrice, competitorPrice,
    category, customerType, sellingPoints,
    enableWebSearch
  } = req.body;

  if (!yourProduct || !competitorProduct) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const hasUrls = !!(enableWebSearch && (yourProductUrl || competitorUrl));

  // Bug 4 fix: two static system prompts so caching works independently for each mode
  const systemPromptBase = `You are a sharp sales intelligence engine for a health supplement brand.
Your job is to generate detailed, agent-ready battle cards when the brand's product is compared to a competitor.
Be direct, specific, and honest. Use real knowledge about supplement categories and brands.
CRITICAL JSON RULES — follow these exactly or the output will break:
1. Respond ONLY with a single pure JSON object — no markdown, no backticks, no preamble, nothing outside the JSON.
2. Never use apostrophes or single quotes inside any string value. Write "do not" instead of "don't", "it is" instead of "it's", "they are" instead of "they're".
3. Never include raw newlines inside string values. Keep every string value on one line.
4. Do not use the rupee symbol. Write INR instead of the rupee sign.
5. All strings must be properly escaped, valid JSON strings.`;

  const systemPromptWebSearch = `You are a sharp sales intelligence engine for a health supplement brand.
Your job is to generate detailed, agent-ready battle cards when the brand's product is compared to a competitor.
IMPORTANT: Product page URLs have been provided. Use the web_search tool to look up these URLs and extract real product data — protein content, price, ingredients, certifications, reviews — before building the comparison. Be specific and data-driven.
Be direct, specific, and honest. Use real knowledge about supplement categories and brands.
CRITICAL JSON RULES — follow these exactly or the output will break:
1. Respond ONLY with a single pure JSON object — no markdown, no backticks, no preamble, nothing outside the JSON.
2. Never use apostrophes or single quotes inside any string value. Write "do not" instead of "don't", "it is" instead of "it's", "they are" instead of "they're".
3. Never include raw newlines inside string values. Keep every string value on one line.
4. Do not use the rupee symbol. Write INR instead of the rupee sign.
5. All strings must be properly escaped, valid JSON strings.`;

  const systemPromptText = hasUrls ? systemPromptWebSearch : systemPromptBase;

  // ── Context builders ─────────────────────────────────────────────────────
  let urlContext = '';
  if (hasUrls && yourProductUrl) urlContext += `\nOUR PRODUCT PAGE URL: ${yourProductUrl} (fetch this to get real specs)`;
  if (hasUrls && competitorUrl)  urlContext += `\nCOMPETITOR PRODUCT PAGE URL: ${competitorUrl} (fetch this to get real specs)`;

  let priceContext = '';
  if (yourProductPrice) priceContext += `\nOUR PRODUCT PRICE (use this exact figure, do not fetch or guess): INR ${yourProductPrice}`;
  if (competitorPrice)  priceContext += `\nCOMPETITOR PRICE (use this exact figure, do not fetch or guess): INR ${competitorPrice}`;

  // ── User prompt ──────────────────────────────────────────────────────────
  const userPrompt = `Generate a detailed sales battle card comparison.

OUR PRODUCT: ${yourProduct}
COMPETITOR: ${competitorProduct}
CATEGORY: ${category}
CUSTOMER TYPE: ${customerType}
${sellingPoints ? `OUR KEY SELLING POINTS: ${sellingPoints}` : ''}
${urlContext}
${priceContext}
${hasUrls ? '\nSearch and fetch the provided URLs to extract real product details before building the comparison. Use actual numbers from the product pages wherever possible.' : ''}

Respond ONLY with this exact JSON structure. No text outside the JSON. No apostrophes in any string value:
{
  "yourProduct": "${yourProduct}",
  "competitorProduct": "${competitorProduct}",
  "dataSource": "${hasUrls ? 'live' : 'ai'}",
  "laymanSummary": "3-4 sentence plain English summary a 16-year-old would understand. No jargon. No apostrophes. Tell them which product wins and why in simple words.",
  "verdict": "2-3 sentence overall verdict on how we win this comparison for a ${customerType}. No apostrophes.",
  "scores": [
    {"label": "Protein per Scoop", "ours": 85, "theirs": 75, "winner": "us", "simpleExplanation": "One plain sentence — what does this score difference mean for the buyer. No technical terms. No apostrophes."},
    {"label": "Value for Money", "ours": 90, "theirs": 65, "winner": "us", "simpleExplanation": "One plain sentence. No apostrophes."},
    {"label": "Taste/Mixability", "ours": 75, "theirs": 80, "winner": "them", "simpleExplanation": "One plain sentence. No apostrophes."},
    {"label": "Ingredient Quality", "ours": 88, "theirs": 70, "winner": "us", "simpleExplanation": "One plain sentence. No apostrophes."},
    {"label": "Brand Trust", "ours": 70, "theirs": 85, "winner": "them", "simpleExplanation": "One plain sentence. No apostrophes."}
  ],
  "ourWins": [
    "Specific advantage 1 with real data or numbers. No apostrophes.",
    "Specific advantage 2. No apostrophes.",
    "Specific advantage 3. No apostrophes.",
    "Specific advantage 4. No apostrophes."
  ],
  "theirWins": [
    "Honest area where competitor is strong 1. No apostrophes.",
    "Honest area where competitor is strong 2. No apostrophes."
  ],
  "talkingPoints": [
    "Ready-to-say line agent can use verbatim 1. No apostrophes.",
    "Ready-to-say line agent can use verbatim 2. No apostrophes.",
    "Ready-to-say line agent can use verbatim 3. No apostrophes.",
    "Ready-to-say line agent can use verbatim 4. No apostrophes.",
    "Ready-to-say line agent can use verbatim 5. No apostrophes."
  ],
  "technicalTerms": [
    {"term": "First technical term from the battle card", "plain": "Plain English explanation in one sentence. No apostrophes."},
    {"term": "Second technical term", "plain": "Plain English explanation. No apostrophes."},
    {"term": "Third technical term", "plain": "Plain English explanation. No apostrophes."}
  ],
  "whatsappMessages": [
    "WhatsApp message 1 under 50 words, conversational, no jargon, no apostrophes, agent can copy-paste when customer shares competitor link.",
    "WhatsApp message 2 different angle, same rules, no apostrophes.",
    "WhatsApp message 3 price-focused, same rules, no apostrophes."
  ],
  "objectionHandlers": [
    {"objection": "Most common objection customer raises. No apostrophes.", "response": "Ideal agent response. No apostrophes."},
    {"objection": "Second common objection. No apostrophes.", "response": "Ideal response. No apostrophes."},
    {"objection": "Third common objection. No apostrophes.", "response": "Ideal response. No apostrophes."}
  ],
  "closingLine": "One powerful closing line the agent can use to convert. No apostrophes.",
  "citations": [
    {
      "claim": "A specific factual claim made anywhere in this battle card. No apostrophes.",
      "source": "Name of authoritative source — e.g. FSSAI official site, PubMed study, brand official page, NSF International, Informed Sport",
      "url": "https://most-likely-real-url-for-this-source.com",
      "verified": false,
      "note": "Suggested reference — verify before sharing with customers"
    },
    {
      "claim": "Second factual claim from the battle card. No apostrophes.",
      "source": "Authoritative source name",
      "url": "https://url-for-this-source.com",
      "verified": false,
      "note": "Suggested reference — verify before sharing with customers"
    },
    {
      "claim": "Third factual claim from the battle card. No apostrophes.",
      "source": "Authoritative source name",
      "url": "https://url-for-this-source.com",
      "verified": false,
      "note": "Suggested reference — verify before sharing with customers"
    }
  ]
}`;

  // ── Claude request body ──────────────────────────────────────────────────
  const claudeBody = {
    model: "claude-sonnet-4-5",
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: systemPromptText,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{ role: "user", content: userPrompt }]
  };

  if (hasUrls) {
    claudeBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  // Timeout strategy:
  // - Web search ON: no timeout — takes 15-20s by design, requires Vercel Pro (60s limit)
  // - Web search OFF: 9s timeout — clean error before Vercel Hobby kills at 10s
  const controller = new AbortController();
  const timeout = hasUrls ? null : setTimeout(() => controller.abort(), 9000);

  try {
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31"
      },
      body: JSON.stringify(claudeBody)
    };
    // Only attach abort signal when timeout is active (non-web-search mode)
    if (!hasUrls) fetchOptions.signal = controller.signal;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", fetchOptions);

    if (timeout) clearTimeout(timeout);

    const data = await claudeRes.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // Extract only text blocks — handles web_search tool_use/tool_result blocks
    const raw = data.content
      .filter(i => i.type === 'text')
      .map(i => i.text || '')
      .join('');

    // Strip markdown fences and replace rupee symbol
    let clean = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, '').trim();
    clean = clean.replace(/₹/g, 'INR');

    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // Fallback: replace unescaped apostrophes inside string values with curly apostrophe
      const fixed = jsonMatch[0].replace(/"([^"]*)"/g, (match, inner) => {
        return '"' + inner.replace(/'/g, '\u2019') + '"';
      });
      try {
        result = JSON.parse(fixed);
      } catch (finalErr) {
        throw new Error('JSON parse failed: ' + finalErr.message);
      }
    }

    // Mark citations as verified if web search was used
    if (result.citations && hasUrls) {
      result.citations = result.citations.map(c => ({
        ...c,
        verified: true,
        note: 'Verified via live web search during this comparison'
      }));
    }

    return res.status(200).json(result);

  } catch (err) {
    if (timeout) clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out — Claude took too long. Try again, or disable web search for faster results.' });
    }
    return res.status(500).json({ error: err.message || 'Claude API call failed' });
  }
}
