export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const { yourProduct, competitorProduct, yourProductUrl, competitorUrl, yourProductPrice, competitorPrice, category, customerType, sellingPoints } = req.body;

  if (!yourProduct || !competitorProduct) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const hasUrls = yourProductUrl || competitorUrl;

  const systemPrompt = `You are a sharp sales intelligence engine for a health supplement brand.
Your job is to generate detailed, agent-ready battle cards when the brand's product is compared to a competitor.
${hasUrls ? `IMPORTANT: Product page URLs have been provided. Use the web_search tool to look up these URLs and extract real product data — protein content, price, ingredients, certifications, reviews — before building the comparison. Be specific and data-driven.` : ''}
Be direct, specific, and honest. Use real knowledge about supplement categories and brands.
Always respond ONLY with pure JSON — no markdown, no preamble, no explanation outside the JSON.`;

  let urlContext = '';
  if (yourProductUrl) urlContext += `\nOUR PRODUCT PAGE URL: ${yourProductUrl} (fetch this to get real specs)`;
  if (competitorUrl) urlContext += `\nCOMPETITOR PRODUCT PAGE URL: ${competitorUrl} (fetch this to get real specs)`;

  let priceContext = '';
  if (yourProductPrice) priceContext += `\nOUR PRODUCT PRICE (use this exact figure, do not fetch or guess): ₹${yourProductPrice}`;
  if (competitorPrice) priceContext += `\nCOMPETITOR PRICE (use this exact figure, do not fetch or guess): ₹${competitorPrice}`;

  const userPrompt = `Generate a detailed sales battle card comparison.

OUR PRODUCT: ${yourProduct}
COMPETITOR: ${competitorProduct}
CATEGORY: ${category}
CUSTOMER TYPE: ${customerType}
${sellingPoints ? `OUR KEY SELLING POINTS: ${sellingPoints}` : ''}
${urlContext}
${priceContext}
${hasUrls ? '\nSearch / fetch the provided URLs above to extract real product details before building the comparison. Use actual numbers from the product pages wherever possible.' : ''}

Respond ONLY with this exact JSON structure (no text outside JSON):
{
  "yourProduct": "${yourProduct}",
  "competitorProduct": "${competitorProduct}",
  "dataSource": "${hasUrls ? 'live' : 'ai'}",
  "laymanSummary": "3-4 sentence plain English summary a 16-year-old would understand. No jargon. Tell them which product wins and exactly why in simple words.",
  "verdict": "2-3 sentence overall verdict on how we win this comparison for a ${customerType}",
  "scores": [
    {"label": "Protein per Scoop", "ours": 85, "theirs": 75, "winner": "us", "simpleExplanation": "One sentence in plain language explaining what this score difference means for the customer — no technical terms"},
    {"label": "Value for Money", "ours": 90, "theirs": 65, "winner": "us", "simpleExplanation": "One sentence plain language explanation"},
    {"label": "Taste/Mixability", "ours": 75, "theirs": 80, "winner": "them", "simpleExplanation": "One sentence plain language explanation"},
    {"label": "Ingredient Quality", "ours": 88, "theirs": 70, "winner": "us", "simpleExplanation": "One sentence plain language explanation"},
    {"label": "Brand Trust", "ours": 70, "theirs": 85, "winner": "them", "simpleExplanation": "One sentence plain language explanation"}
  ],
  "ourWins": [
    "Specific advantage 1 with real data/numbers",
    "Specific advantage 2",
    "Specific advantage 3",
    "Specific advantage 4"
  ],
  "theirWins": [
    "Honest area where competitor is strong 1",
    "Honest area where competitor is strong 2"
  ],
  "talkingPoints": [
    "Ready-to-say line agent can use verbatim 1",
    "Ready-to-say line agent can use verbatim 2",
    "Ready-to-say line agent can use verbatim 3",
    "Ready-to-say line agent can use verbatim 4",
    "Ready-to-say line agent can use verbatim 5"
  ],
  "technicalTerms": [
    {"term": "technical term used anywhere in this battle card", "plain": "plain English explanation in one sentence that any layman understands"},
    {"term": "second technical term", "plain": "plain English explanation"},
    {"term": "third technical term", "plain": "plain English explanation"}
  ],
  "whatsappMessages": [
    "WhatsApp message 1 — under 50 words, conversational, no jargon, agent can copy-paste directly when customer shares competitor link",
    "WhatsApp message 2 — different angle, same rules",
    "WhatsApp message 3 — price-focused, same rules"
  ],
  "objectionHandlers": [
    {"objection": "Most common objection customer raises when they prefer the competitor", "response": "Ideal agent response — confident, factual, not defensive"},
    {"objection": "Second common objection", "response": "Ideal response"},
    {"objection": "Third common objection", "response": "Ideal response"}
  ],
  "closingLine": "One powerful closing line the agent can use to convert"
}`;

  const claudeBody = {
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  };

  if (hasUrls) {
    claudeBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(claudeBody)
    });

    const data = await claudeRes.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const raw = data.content
      .filter(i => i.type === 'text')
      .map(i => i.text || '')
      .join('');

    const clean = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Claude API call failed' });
  }
}
