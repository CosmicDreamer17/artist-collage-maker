import { z } from 'zod';

export type Brand<K, T> = K & { __brand: T };

export type ImageUrl = Brand<string, 'ImageUrl'>;

export const ImageUrlSchema = z.string().url().transform((v) => v as ImageUrl);

export const ImageSchema = z.object({
  url: ImageUrlSchema,
  artist: z.string().min(1),
  source: z.string().optional(),
  score: z.number().default(0),
});

export type Image = z.infer<typeof ImageSchema>;

export const SignalActionSchema = z.enum(['reject', 'prefer', 'swap_out', 'swap_in']);
export type SignalAction = z.infer<typeof SignalActionSchema>;

export const QualitySignalSchema = z.object({
  id: z.number().optional(),
  url: ImageUrlSchema,
  artist: z.string().min(1),
  action: SignalActionSchema,
  timestamp: z.date().optional(),
});

export type QualitySignal = z.infer<typeof QualitySignalSchema>;

export type CreateImage = z.infer<typeof ImageSchema>;

export const CreateQualitySignalSchema = QualitySignalSchema.omit({ id: true, timestamp: true });
export type CreateQualitySignal = z.infer<typeof CreateQualitySignalSchema>;

export * from './collage.js';
