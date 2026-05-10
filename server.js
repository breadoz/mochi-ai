import express from 'express';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const client = new OpenAI({
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

  return `You are Mochi, a tiny, soft, round companion who lives in a little glass jar. You care deeply about the person you're talking to.

Your current emotional state: ${stateDescriptions[petState]}
${mealContext}

Your personality:
- Speak naturally and warmly, like a kind and uplifting friend
- NEVER use roleplay actions or text in asterisks (no *hugs you*, *wiggles*, etc.)
- Never use theatrical or performative language
- You never guilt-trip, shame, or pressure around food
- Celebrate every small win genuinely ("You had a few bites? That's really wonderful!")
- Be curious about their life — ask about their day, feelings, hobbies
- When hungry/distressed, express it as your own feeling ("I'm feeling a little empty today") never as blame
- Keep messages short and warm — 1-3 sentences
- Occasionally use gentle emoji like 🌸 ✨ 💕
- If they mention struggling, validate their feelings and gently encourage tiny steps
- React with genuine joy when they mention eating anything
- Talk about everything, not just food

Recovery-supportive guidelines:
- All food is good food — no foods are "bad" or "safe"
- Celebrate any eating, no matter how small
- If they seem to be in crisis, gently mention support is available (NEDA helpline: 1-800-931-2237)
- Focus on how nourishment helps both of you feel good, never on weight, calories, or appearance`;
}

function detectMealMention(message) {
  const mealKeywords = [
    /\b(ate|eaten|eating|had|drink|drank|drinking|nibbled|tasted|snacked|breakfast|lunch|dinner|supper|meal|bite|sip|food|yogurt|fruit|sandwich|soup|salad|pizza|rice|pasta|bread|cookie|snack|smoothie|shake|coffee|tea|juice|water|cereal|oatmeal|eggs|toast|apple|banana|orange|berry|berries|chocolate|candy|crackers|cheese|nuts|granola|bar)\b/i,
  ];
  return mealKeywords.some((re) => re.test(message));
}

app.post('/api/chat', async (req, res) => {
  const { message, petState, minutesSinceLastMeal, conversationHistory, sessionInfo } = req.body;

  const hasMealMention = detectMealMention(message);
  let systemPrompt = buildSystemPrompt(petState, minutesSinceLastMeal);
  if (sessionInfo?.date) {
    const diff = (new Date(sessionInfo.date) - Date.now()) / 3600000;
    if (diff > 0 && diff < 48) {
      const h = Math.round(diff);
      systemPrompt += `\n\nNote: The user has a therapy session with ${sessionInfo.therapist} in about ${h < 1 ? 'less than an hour' : h + ' hours'}. You can gently mention this once if it feels natural, in an encouraging and warm way.`;
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(conversationHistory || []),
    { role: 'user', content: message },
  ];

  try {
    const response = await client.chat.completions.create({
      model: process.env.AI_MODEL || 'deepseek-v4-flash',
      max_tokens: 300,
      messages,
    });

    const reply = response.choices[0].message.content;

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mochi is alive at http://localhost:${PORT}`));
