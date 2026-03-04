import { Request } from 'express';
import type { CafeRow } from '../models/cafe';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
  cafe_id?: number | null;
  cafe_slug?: string | null;
  cafe_name?: string | null;
  effective_role?: string;
}

export interface ImpersonationContext {
  isImpersonating: boolean;
  cafeId?: number;
  cafeSlug?: string;
  cafeName?: string;
  impersonatedRole?: string;
  originalUserId?: number;
  originalRole?: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthUser;
      impersonation?: ImpersonationContext;
      cafeId?: number;
      cafe?: CafeRow;
      subscription?: { plan: string; status: string; enabledModules?: unknown };
      _startTime?: number;
      _lockoutKey?: string;
      _lockoutRecord?: { count: number; lockedUntil?: number };
    }
    interface Response {
      successData?: (data: unknown, meta?: Record<string, unknown>) => void;
      errorResponse?: (message: string, code?: string, status?: number) => void;
    }
  }
}

export {};
