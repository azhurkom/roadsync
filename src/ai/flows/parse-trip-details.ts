import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseTripDetailsInputSchema = z.object({
  message: z.string().describe('The raw text message containing trip details.'),
});
export type ParseTripDetailsInput = z.infer<typeof ParseTripDetailsInputSchema>;

const ParseTripDetailsOutputSchema = z.object({
  description: z.string().describe('A short summary or title for the trip in Ukrainian. e.g., "Перевезення товарів до Берліна".'),
  referenceNumber: z.string().optional().describe('Any reference or booking number found in the message.'),
  loadAddresses: z.array(z.string()).describe('A list of all loading addresses mentioned. City names must be in German.'),
  unloadAddresses: z.array(z.string()).describe('A list of all unloading addresses mentioned. City names must be in German.'),
});
export type ParseTripDetailsOutput = z.infer<typeof ParseTripDetailsOutputSchema>;

const prompt = ai.definePrompt({
  name: 'parseTripDetailsPrompt',
  input: { schema: ParseTripDetailsInputSchema },
  output: { schema: ParseTripDetailsOutputSchema },
  prompt: `You are an expert logistics assistant. Your task is to parse a raw text message and extract key information about a transport trip.

Carefully analyze the following message and identify:
1.  A brief description of the trip, in Ukrainian. e.g., "Перевезення товарів до Берліна".
2.  Any reference number (like a CMR, booking number, or client reference).
3.  All addresses for loading. Important: City names must be in German.
4.  All addresses for unloading. Important: City names must be in German.

Return the extracted information in the specified JSON format.

Message:
{{{message}}}
`,
});

export const parseTripDetailsFlow = ai.defineFlow(
  {
    name: 'parseTripDetailsFlow',
    inputSchema: ParseTripDetailsInputSchema,
    outputSchema: ParseTripDetailsOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
