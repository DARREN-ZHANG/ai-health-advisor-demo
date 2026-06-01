import { z } from 'zod';
import { MICRO_EVENT_TYPES } from '../types/micro-event';

export const MicroEventTypeSchema = z.enum(MICRO_EVENT_TYPES);
export const MicroEventParamsSchema = z.record(z.union([z.number(), z.string(), z.boolean()]));
