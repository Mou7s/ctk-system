import request from '@/utils/request';
import { createTkApi } from '@ctk-system/api';

/** Injected tk_custom API surface (request stays in apps/web). */
export const tkApi = createTkApi(request);