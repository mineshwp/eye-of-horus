import Anthropic from '@anthropic-ai/sdk';

const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_STRATEGIC = 'claude-sonnet-4-6';

const AGENCY_SYSTEM = `You are Horus, an AI strategist embedded in Eye of Horus — a website monitoring and reporting platform for a digital agency.
You monitor client websites and communicate insights to the agency team.
Never just summarise data. Always explain: what happened, why it matters for this business, how urgent it is, and what action should be taken next.
Be direct, practical, and specific. Write for a technical team that values speed and clarity.
Keep responses concise — aim for 2-4 sentences unless explicitly asked for more.`;

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export async function ai(
  userPrompt: string,
  options: {
    system?: string;
    model?: 'fast' | 'strategic';
    maxTokens?: number;
  } = {},
): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number } | null> {
  const client = getClient();
  if (!client) return null;

  const modelId = options.model === 'strategic' ? MODEL_STRATEGIC : MODEL_FAST;
  const system = options.system ?? AGENCY_SYSTEM;
  const maxTokens = options.maxTokens ?? 512;

  try {
    const message = await client.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const text = textBlock ? (textBlock as { type: 'text'; text: string }).text : '';

    return {
      text,
      model: modelId,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  } catch (err) {
    console.error('[ai] Error:', err);
    return null;
  }
}

export function isAIConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
