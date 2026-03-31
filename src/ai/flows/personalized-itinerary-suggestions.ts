'use server';
/**
 * @fileOverview A personalized travel itinerary suggestion AI agent.
 *
 * - personalizedItinerarySuggestions - A function that generates personalized travel itineraries.
 * - PersonalizedItinerarySuggestionsInput - The input type for the personalizedItinerarySuggestions function.
 * - PersonalizedItinerarySuggestionsOutput - The return type for the personalizedItinerarySuggestions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PersonalizedItinerarySuggestionsInputSchema = z.object({
  preferences: z
    .string()
    .describe('The user preferences for the trip, e.g., scenic route, historical sites.'),
  budget: z.string().describe('The user budget for the trip.'),
  travelHistory: z.string().describe('The user travel history.'),
  interests: z.string().describe('The user interests, e.g., food, adventure, relaxation.'),
  travelDate: z.string().describe('The date the user plans to travel.'),
  origin: z.string().describe('The origin city for the trip.'),
  destination: z.string().describe('The destination city for the trip.'),
});

export type PersonalizedItinerarySuggestionsInput = z.infer<
  typeof PersonalizedItinerarySuggestionsInputSchema
>;

const PersonalizedItinerarySuggestionsOutputSchema = z.object({
  itinerary: z.string().describe('The personalized travel itinerary.'),
});

export type PersonalizedItinerarySuggestionsOutput = z.infer<
  typeof PersonalizedItinerarySuggestionsOutputSchema
>;

export async function personalizedItinerarySuggestions(
  input: PersonalizedItinerarySuggestionsInput
): Promise<PersonalizedItinerarySuggestionsOutput> {
  return personalizedItinerarySuggestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'personalizedItinerarySuggestionsPrompt',
  input: {schema: PersonalizedItinerarySuggestionsInputSchema},
  output: {schema: PersonalizedItinerarySuggestionsOutputSchema},
  prompt: `You are a travel agent specializing in personalized bus trip itineraries.

Based on the user's preferences, budget, travel history, interests, and travel date, create a personalized itinerary.

User Preferences: {{{preferences}}}
Budget: {{{budget}}}
Travel History: {{{travelHistory}}}
Interests: {{{interests}}}
Travel Date: {{{travelDate}}}
Origin: {{{origin}}}
Destination: {{{destination}}}

Create a detailed and engaging itinerary for the user's bus trip.`,
});

const personalizedItinerarySuggestionsFlow = ai.defineFlow(
  {
    name: 'personalizedItinerarySuggestionsFlow',
    inputSchema: PersonalizedItinerarySuggestionsInputSchema,
    outputSchema: PersonalizedItinerarySuggestionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
