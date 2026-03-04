import Cafe from '../models/cafe';
import * as featureService from './featureService';
import * as auditService from './auditService';
import logger from '../config/logger';
import { CafeRow } from '../models/cafe';

export const PLANS = {
  FREE: 'FREE',
  PRO: 'PRO'
} as const;

export const STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired'
} as const;

export const MODULES = {
  ORDERS: 'orders',
  ANALYTICS: 'analytics',
  USERS: 'users',
  MENU_MANAGEMENT: 'menu_management',
  ADVANCED_REPORTS: 'advanced_reports',
  INVENTORY: 'inventory',
  CUSTOMERS: 'customers',
  INVOICES: 'invoices',
  PAYMENT_METHODS: 'payment_methods',
  SETTINGS: 'settings'
} as const;

export const PLAN_FEATURES: Record<string, string[]> = {
  [PLANS.FREE]: [
    MODULES.ORDERS,
    MODULES.MENU_MANAGEMENT,
    MODULES.CUSTOMERS,
    MODULES.INVOICES,
    MODULES.PAYMENT_METHODS,
    MODULES.SETTINGS
  ],
  [PLANS.PRO]: [
    MODULES.ORDERS,
    MODULES.ANALYTICS,
    MODULES.USERS,
    MODULES.MENU_MANAGEMENT,
    MODULES.ADVANCED_REPORTS,
    MODULES.INVENTORY,
    MODULES.CUSTOMERS,
    MODULES.INVOICES,
    MODULES.PAYMENT_METHODS,
    MODULES.SETTINGS
  ]
};

export function getAllModules(): string[] {
  return Object.values(MODULES);
}

export function getAllPlans(): string[] {
  return Object.values(PLANS);
}

export function getAllStatuses(): string[] {
  return Object.values(STATUSES);
}

export function getPlanFeatures(plan: string): string[] {
  return PLAN_FEATURES[plan] || [];
}

export function planHasModule(plan: string, module: string): boolean {
  const features = getPlanFeatures(plan);
  return features.includes(module);
}

export interface CafeSubscription {
  plan: string;
  status: string;
  enabledModules: unknown;
}

export async function getCafeSubscription(cafeId: number): Promise<CafeSubscription | null> {
  try {
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      return null;
    }

    let enabledModules: unknown = null;
    if (cafe.enabled_modules) {
      if (typeof cafe.enabled_modules === 'string') {
        try {
          enabledModules = JSON.parse(cafe.enabled_modules);
        } catch {
          enabledModules = null;
        }
      } else if (typeof cafe.enabled_modules === 'object') {
        enabledModules = cafe.enabled_modules;
      }
    }

    const plan = cafe.subscription_plan ? cafe.subscription_plan.toUpperCase() : PLANS.FREE;

    return {
      plan,
      status: cafe.subscription_status || STATUSES.ACTIVE,
      enabledModules
    };
  } catch (error) {
    throw new Error(`Error fetching cafe subscription: ${(error as Error).message}`);
  }
}

export async function cafeHasModuleAccess(cafeId: number, module: string): Promise<boolean> {
  try {
    return await featureService.cafeHasFeature(cafeId, module);
  } catch (error) {
    logger.error('Error checking module access', { message: (error as Error).message });
    return false;
  }
}

export async function updateCafeSubscription(
  cafeId: number,
  subscriptionData: { plan?: string; status?: string },
  changedBy: number | null = null
): Promise<CafeRow> {
  try {
    const { plan, status } = subscriptionData;

    const currentCafe = await Cafe.getById(cafeId);
    if (!currentCafe) {
      throw new Error('Cafe not found');
    }

    const updateData: Partial<CafeRow> = {};

    if (plan !== undefined && plan !== null) {
      const normalizedPlan = plan.toUpperCase();

      if (!getAllPlans().includes(normalizedPlan)) {
        throw new Error(`Invalid subscription plan: ${plan}. Valid plans are: ${getAllPlans().join(', ')}`);
      }

      if (currentCafe.subscription_plan !== normalizedPlan) {
        await auditService.logAuditEvent(
          cafeId,
          auditService.ACTION_TYPES.PLAN_CHANGED,
          currentCafe.subscription_plan || 'FREE',
          normalizedPlan,
          changedBy
        );
      }

      updateData.subscription_plan = normalizedPlan;
    }

    if (status !== undefined) {
      if (!getAllStatuses().includes(status)) {
        throw new Error(`Invalid subscription status: ${status}`);
      }

      if (currentCafe.subscription_status !== status) {
        const actionType =
          status === 'active' ? auditService.ACTION_TYPES.CAFE_ACTIVATED : auditService.ACTION_TYPES.CAFE_DEACTIVATED;

        await auditService.logAuditEvent(
          cafeId,
          actionType,
          currentCafe.subscription_status || 'inactive',
          status,
          changedBy
        );
      }

      updateData.subscription_status = status;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No subscription data provided');
    }

    const updatedCafe = await Cafe.update(cafeId, updateData);

    return updatedCafe;
  } catch (error) {
    throw new Error(`Error updating cafe subscription: ${(error as Error).message}`);
  }
}

export async function toggleCafeModule(
  cafeId: number,
  module: string,
  enabled: boolean
): Promise<Record<string, boolean>> {
  try {
    const previousValue = await featureService.cafeHasFeature(cafeId, module);

    await featureService.toggleCafeFeature(cafeId, module, enabled);

    await auditService.logAuditEvent(
      cafeId,
      enabled ? auditService.ACTION_TYPES.FEATURE_ENABLED : auditService.ACTION_TYPES.FEATURE_DISABLED,
      previousValue ? 'enabled' : 'disabled',
      enabled ? 'enabled' : 'disabled',
      null
    );

    return await featureService.resolveCafeFeatures(cafeId);
  } catch (error) {
    throw new Error(`Error toggling cafe module: ${(error as Error).message}`);
  }
}
