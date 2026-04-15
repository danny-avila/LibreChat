import { z } from 'zod';

const RGB_REGEX = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/;

function isValidRGB(value: string): boolean {
  const match = value.match(RGB_REGEX);
  if (!match) {
    return false;
  }
  return (
    parseInt(match[1], 10) <= 255 && parseInt(match[2], 10) <= 255 && parseInt(match[3], 10) <= 255
  );
}

export const rgbColorSchema = z.string().refine(isValidRGB, {
  message: 'Must be an RGB color like "26 26 46" (three space-separated integers 0-255)',
});

export const paletteSchema = z.record(z.string(), rgbColorSchema);

export const themeSchema = z.object({
  palette: z
    .object({
      light: paletteSchema.optional(),
      dark: paletteSchema.optional(),
    })
    .optional(),
});
