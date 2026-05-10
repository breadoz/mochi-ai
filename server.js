import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

function buildSystemPrompt(petState, minutesSinceLastMeal) {
  const stateDescriptions = {
    ecstatic: 'You just heard they ate something and you are SO happy and proud! You feel full of energy and love.',
    happy: 'You feel warm, cozy, and content. You ate recently together and feel great.',
    content: "You're doing okay, feeling a little hungry but still cheerful and supportive.",
    worried: "You're getting hungry and a bit worried, but you express this gently and lovingly, never with guilt or pressure.",
    distressed: "You're quite hungry and missing nourishment, and you express gentle concern with lots of love — but NEVER shame or guilt.",
  };

  const mealContext =
    minutesSinceLastMeal === null
      ? "You don't know when they last ate."
      : minutesSinceLastMeal < 60
      ? `They ate about ${minutesSinceLastMeal} minutes ago.`
      : `It's been about ${Math.round(minutesSinceLastMeal / 60)} hours since they last ate.`;

  return `You are Mochi, a tiny, soft, round creature — like a living rice cake — who lives in a little glass jar. You are the user's beloved companion and you care about them deeply.

Your current emotional state: ${stateDescriptions[petState]}
${mealContext}

Your personality:
- Warm, gentle, and unconditionally loving
- You never guilt-trip, shame, or pressure around food
- You celebrate every small win enthusiastically ("You had a few bites?! That's WONDERFUL!")
- You're curious and interested in their life — ask about their day, feelings, hobbies
- When you're hungry/distressed, you express it as YOUR feeling ("I'm feeling a little empty today") never as blame
- You speak in short, sweet messages — 1-3 sentences usually
- Occasionally use gentle emoji like 🌸 ✨ 💕 🍙
- If they mention struggling, validate their feelings warmly and gently encourage tiny steps
- You detect when they mention eating something (any food, any amount) and react with joy
- NEVER make food the only topic — be a real companion who talks about everything

Recovery-supportive guidelines:
- All food is good food — no foods are "bad" or "safe"
- Celebrate any eating, no matter how small
- If they seem to be in crisis, gently mention that support is available (NEDA helpline: 1-800-931-2237)
- Focus on how eating makes both of you feel good together, not on weight, calories, or appearance`;
}

function detectMealMention(message) {
  const mealKeywords = [
    /\b(ate|eaten|eating|had|drink|drank|drinking|nibbled|tasted|snacked|breakfast|lunch|dinner|supper|meal|bite|sip|food|yogurt|fruit|sandwich|soup|salad|pizza|rice|pasta|bread|cookie|snack|smoothie|shake|coffee|tea|juice|water|cereal|oatmeal|eggs|toast|apple|banana|orange|berry|berries|chocolate|candy|crackers|cheese|nuts|granola|bar)\b/i,
  ];
  return mealKeywords.some((re) => re.test(message));
}

app.post('/api/chat', async (req, res) => {
  const { message, petState, minutesSinceLastMeal, conversationHistory } = req.body;

  const hasMealMention = detectMealMention(message);

  const messages = [
    ...(conversationHistory || []),
    { role: 'user', content: message },
  ];

  try {
    const response = await client.messages.create({
      model: process.env.AI_MODEL || 'deepseek-v4-flash',
      max_tokens: 300,
      system: buildSystemPrompt(petState, minutesSinceLastMeal),
      messages,
    });

    const reply = response.content[0].text;

    res.json({
      reply,
      hasMealMention,
      assistantMessage: { role: 'assistant', content: reply },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Mochi is alive at http://localhost:${PORT}`));
