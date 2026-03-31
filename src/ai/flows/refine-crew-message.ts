'use server';
/**
 * @fileOverview An AI agent to refine messages from cabin crew for passengers.
 *
 * - refineCrewMessage - A function that refines a raw message into a professional one.
 * - RefineCrewMessageInput - The input type for the refineCrewMessage function.
 * - RefineCrewMessageOutput - The return type for the refineCrewMessage function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const RefineCrewMessageInputSchema = z.object({
  rawMessage: z.string().describe('The raw, potentially unprofessional message from the cabin crew.'),
});
export type RefineCrewMessageInput = z.infer<typeof RefineCrewMessageInputSchema>;

const RefineCrewMessageOutputSchema = z.object({
  refinedMessage: z.string().describe('The polished, professional, and reassuring message to be sent to passengers.'),
});
export type RefineCrewMessageOutput = z.infer<typeof RefineCrewMessageOutputSchema>;

export async function refineCrewMessage(
  input: RefineCrewMessageInput
): Promise<RefineCrewMessageOutput> {
  return refineCrewMessageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'refineCrewMessagePrompt',
  input: { schema: RefineCrewMessageInputSchema },
  output: { schema: RefineCrewMessageOutputSchema },
  prompt: `You are a professional communication assistant for a bus service.
Your task is to refine a raw message from the cabin crew into a clear, polite, and reassuring message for passengers.
The message should be suitable for an emergency or unexpected situation.

Analyze the sentiment of the raw message.
- If the message conveys negative news (e.g., delay, breakdown, traffic), the refined message must include a sincere apology for the inconvenience and appreciation for the passengers' patience.
- If the message conveys positive news (e.g., arriving early, free snacks), adopt a happy and cheerful tone.
- For neutral announcements, maintain a professional and clear tone.

IMPORTANT: When dealing with delays or time estimates, avoid definitive language. Use phrases like "we expect to be moving again in..." or "we anticipate a delay of..." instead of words like "approximately". This acknowledges that the situation is dynamic and can change.

Always start the message with a polite opening like "Dear Passengers,". Keep the message concise and to the point.

Raw message from crew:
"{{{rawMessage}}}"

Generate the refined message.`,
});

const refineCrewMessageFlow = ai.defineFlow(
  {
    name: 'refineCrewMessageFlow',
    inputSchema: RefineCrewMessageInputSchema,
    outputSchema: RefineCrewMessageOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
