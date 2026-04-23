import { ai } from '@/ai/genkit';
import { z } from 'genkit';
const GeolocateActionInputSchema = z.object({
  latitude: z.number().describe('Широта дії.'),
  longitude: z.number().describe('Довгота дії.'),
});
export type GeolocateActionInput = z.infer<typeof GeolocateActionInputSchema>;
const GeolocateActionOutputSchema = z.object({
  city: z.string().describe('Точна назва населеного пункту до найдрібнішого рівня (село, селище, район міста) німецькою мовою.'),
});
export type GeolocateActionOutput = z.infer<typeof GeolocateActionOutputSchema>;
const prompt = ai.definePrompt({
  name: 'geolocateActionPrompt',
  input: { schema: GeolocateActionInputSchema },
  output: { schema: GeolocateActionOutputSchema },
  prompt: `Ви — експерт з геолокації. За даними широти та довготи визначте точний населений пункт — аж до найдрібнішого рівня: село, селище, район міста, містечко тощо. Якщо координати вказують на невелике село поблизу міста — вкажіть саме село, а не місто. Назва має бути німецькою мовою. Повертайте лише назву населеного пункту без додаткового тексту.

Широта: {{{latitude}}}
Довгота: {{{longitude}}}
Населений пункт:`,
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
