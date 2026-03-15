import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GeolocateActionInputSchema = z.object({
  latitude: z.number().describe('Широта дії.'),
  longitude: z.number().describe('Довгота дії.'),
});
export type GeolocateActionInput = z.infer<typeof GeolocateActionInputSchema>;

const GeolocateActionOutputSchema = z.object({
  city: z.string().describe('Найближче місто до заданих координат (німецькою мовою).'),
});
export type GeolocateActionOutput = z.infer<typeof GeolocateActionOutputSchema>;

const prompt = ai.definePrompt({
  name: 'geolocateActionPrompt',
  input: { schema: GeolocateActionInputSchema },
  output: { schema: GeolocateActionOutputSchema },
  prompt: `Ви — експерт з геолокації. За даними широти та довготи визначте найближче місто. Назва міста має бути німецькою мовою.

Широта: {{{latitude}}}
Довгота: {{{longitude}}}

Місто:`,
});

export const geolocateActionFlow = ai.defineFlow(
  {
    name: 'geolocateActionFlow',
    inputSchema: GeolocateActionInputSchema,
    outputSchema: GeolocateActionOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
