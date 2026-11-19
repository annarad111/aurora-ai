import { z } from 'zod';

export const conversationIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'A conversation id is 8 to 64 letters, digits or dashes');
