import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ExtractOdometerReadingInputSchema = z.object({
  photoDataUri: z.string().describe(
    'Фотографія тахографа у вигляді URI даних, яка повинна містити тип MIME та використовувати кодування Base64. Очікуваний формат: data:<mimetype>;base64,<encoded_data>.'
  ),
});
export type ExtractOdometerReadingInput = z.infer<typeof ExtractOdometerReadingInputSchema>;

const ExtractOdometerReadingOutputSchema = z.object({
  odometerReading: z.string().describe('Витягнуті показання одометра з фотографії тахографа.'),
});
export type ExtractOdometerReadingOutput = z.infer<typeof ExtractOdometerReadingOutputSchema>;

const prompt = ai.definePrompt({
  name: 'extractOdometerReadingPrompt',
  input: { schema: ExtractOdometerReadingInputSchema },
  output: { schema: ExtractOdometerReadingOutputSchema },
  prompt: `Ви — експерт з оптичного розпізнавання символів для зображень тахографів. Витягніть показання одометра з наданої фотографії тахографа. Повертайте лише показання одометра, що складаються з перших 6 цифр перед десятковою комою.

Фото: {{media url=photoDataUri}}`,
});

export const extractOdometerReadingFlow = ai.defineFlow(
  {
    name: 'extractOdometerReadingFlow',
    inputSchema: ExtractOdometerReadingInputSchema,
    outputSchema: ExtractOdometerReadingOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
