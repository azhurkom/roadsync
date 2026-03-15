import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GeocodeAddressInputSchema = z.object({
  address: z.string().describe('Повна адреса для геокодування.'),
});
export type GeocodeAddressInput = z.infer<typeof GeocodeAddressInputSchema>;

const GeocodeAddressOutputSchema = z.object({
  latitude: z.number().describe('Широта адреси.'),
  longitude: z.number().describe('Довгота адреси.'),
});
export type GeocodeAddressOutput = z.infer<typeof GeocodeAddressOutputSchema>;

const prompt = ai.definePrompt({
  name: 'geocodeAddressPrompt',
  input: { schema: GeocodeAddressInputSchema },
  output: { schema: GeocodeAddressOutputSchema },
  prompt: `Ви — експертна система геокодування, аналогічна API Карт Google. Ваше завдання — повернути максимально точні координати для заданої адреси. Точність на рівні будівлі є обов'язковою.

ЗАПИТ:
Адреса: "{{{address}}}"

ВИМОГИ:
1.  **АНАЛІЗ**: Ретельно проаналізуйте КОЖЕН компонент адреси: країна, поштовий індекс, місто, вулиця, номер будинку.
2.  **ТОЧНІСТЬ**: Результат МАЄ бути еквівалентним точності "ROOFTOP" в API геокодування Google. Інтерполяція або приблизні координати НЕПРИПУСТИМІ.
3.  **ФОРМАТ**: Поверніть координати у вигляді десяткових дробів з 7-8 знаками після коми для забезпечення високої точності.
4.  **ВАЛІДАЦІЯ**: Якщо ви не можете гарантувати точність на рівні будівлі для наданої адреси, ОБОВ'ЯЗКОВО поверніть широту 0 і довготу 0. НЕ вгадуйте.`,
});

export const geocodeAddressFlow = ai.defineFlow(
  {
    name: 'geocodeAddressFlow',
    inputSchema: GeocodeAddressInputSchema,
    outputSchema: GeocodeAddressOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
