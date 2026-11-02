'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeIncidentInputSchema = z.object({
  crewReport: z.string().describe('The incident report entered by the cabin crew.'),
  timeToRespondSeconds: z.number().nullable().optional().describe('How many seconds it took for the crew to respond to the alarm, or null if withdrawn/immediate.'),
  wasSevere: z.boolean().default(false).describe('Whether the alarm escalated to a severe status (took > 3 minutes).'),
});
export type AnalyzeIncidentInput = z.infer<typeof AnalyzeIncidentInputSchema>;

const AnalyzeIncidentOutputSchema = z.object({
  aiAnalysis: z.string().describe('A professional summary and analysis of the incident, including response time context.'),
});
export type AnalyzeIncidentOutput = z.infer<typeof AnalyzeIncidentOutputSchema>;

export async function analyzeIncident(
  input: AnalyzeIncidentInput
): Promise<AnalyzeIncidentOutput> {
  const normalizedInput: AnalyzeIncidentInput = {
    crewReport: input.crewReport || '',
    timeToRespondSeconds: typeof input.timeToRespondSeconds === 'number' && !isNaN(input.timeToRespondSeconds)
      ? input.timeToRespondSeconds
      : null,
    wasSevere: Boolean(input.wasSevere),
  };
  return analyzeIncidentFlow(normalizedInput);
}

const prompt = ai.definePrompt({
  name: 'analyzeIncidentPrompt',
  input: { schema: AnalyzeIncidentInputSchema },
  output: { schema: AnalyzeIncidentOutputSchema },
  prompt: `You are an AI Safety Analyst for a premium bus service.
Your task is to analyze an emergency incident based on the crew's report and the response metrics.

Input Metrics:
- Time to respond: {{#if timeToRespondSeconds}}{{timeToRespondSeconds}} seconds{{else}}Not applicable / Withdrawn by passenger / Immediate{{/if}}
- Was severe escalation triggered: {{wasSevere}}

Crew's Raw Report:
"{{{crewReport}}}"

Please provide a concise, professional paragraph summarizing the incident. 
Include an assessment of the situation and response context. If it was severe, note that it breached the 3-minute SLA. If it was withdrawn by passenger or triggered by mistake, acknowledge that appropriately.
Format the output as a clean text string, ready to be read by the Admin.
Do not use markdown formatting.`,
});

const analyzeIncidentFlow = ai.defineFlow(
  {
    name: 'analyzeIncidentFlow',
    inputSchema: AnalyzeIncidentInputSchema,
    outputSchema: AnalyzeIncidentOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
