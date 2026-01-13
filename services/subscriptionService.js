const Cafe = require('../models/cafe');
const featureService = require('./featureService');
const auditService = require('./auditService');

/**
 * Subscription Service
 * 
 * Defines subscription plans, feature modules, and provides
 * methods to check feature access based on subscription.
 */

// Available subscription plans
const PLANS = {
  FREE: 'FREE',
  PRO: 'PRO'
};

// Subscription statuses
const STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired'
};

// Application modules/features
const MODULES = {
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
};

// Plan-to-module mapping
// PRO must be a superset of FREE
const PLAN_FEATURES = {
  [PLANS.FREE]: [
    MODULES.ORDERS,
    MODULES.MENU_MANAGEMENT,
    MODULES.CUSTOMERS,
    MODULES.INVOICES,
    MODULES.PAYMENT_METHODS,
    MODULES.SETTINGS
  ],
  [PLANS.PRO]: [
    // All FREE features plus:
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

/**
 * Get all available modules
 */
function getAllModules() {
  return Object.values(MODULES);
}

/**
 * Get all available plans
 */
function getAllPlans() {
  return Object.values(PLANS);
}

/**
 * Get all available statuses
 */
function getAllStatuses() {
  return Object.values(STATUSES);
}

/**
 * Get features available for a plan
 */
function getPlanFeatures(plan) {
  return PLAN_FEATURES[plan] || [];
}

/**
 * Check if a plan has access to a module
 */
function planHasModule(plan, module) {
  const features = getPlanFeatures(plan);
  return features.includes(module);
}

/**
 * Get cafe subscription info
 */
async function getCafeSubscription(cafeId) {
  try {
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      return null;
    }

    // enabled_modules is already parsed by Cafe.getById()
    // Check if it's already an object or needs parsing
    let enabledModules = null;
    if (cafe.enabled_modules) {
      if (typeof cafe.enabled_modules === 'string') {
        try {
          enabledModules = JSON.parse(cafe.enabled_modules);
        } catch (e) {
          enabledModules = null;
        }
      } else if (typeof cafe.enabled_modules === 'object') {
        enabledModules = cafe.enabled_modules;
      }
    }

    return {
      plan: cafe.subscription_plan || PLANS.FREE,
      status: cafe.subscription_status || STATUSES.ACTIVE,
      enabledModules: enabledModules
    };
  } catch (error) {
    throw new Error(`Error fetching cafe subscription: ${error.message}`);
  }
}

/**
 * Check if cafe has access to a module
 * 
 * Logic:
 * 1. If subscription_status is not 'active', deny access
 * 2. If enabled_modules override exists for this module, use that
 * 3. Otherwise, check if the plan includes the module
 */
async function cafeHasModuleAccess(cafeId, module) {
  try {
    const subscription = await getCafeSubscription(cafeId);
    
    if (!subscription) {
      return false;
    }

    // If subscription is not active, deny access
    if (subscription.status !== STATUSES.ACTIVE) {
      return false;
    }

    // Check for per-cafe module override
    if (subscription.enabledModules !== null && typeof subscription.enabledModules === 'object') {
      if (subscription.enabledModules.hasOwnProperty(module)) {
        return subscription.enabledModules[module] === true;
      }
    }

    // Check plan-based access
    return planHasModule(subscription.plan, module);
  } catch (error) {
    console.error('Error checking module access:', error);
    return false;
  }
}

/**
 * Update cafe subscription
 */
async function updateCafeSubscription(cafeId, subscriptionData, changedBy = null) {
  try {
    const { plan, status } = subscriptionData;
    
    // Get current subscription for audit
    const currentCafe = await Cafe.getById(cafeId);
    if (!currentCafe) {
      throw new Error('Cafe not found');
    }
    
    const updateData = {};
    
    if (plan !== undefined && plan !== null) {
      // Normalize plan value (uppercase)
      const normalizedPlan = plan.toUpperCase();
      
      if (!getAllPlans().includes(normalizedPlan)) {
        throw new Error(`Invalid subscription plan: ${plan}. Valid plans are: ${getAllPlans().join(', ')}`);
      }
      
      // Log plan change
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
      
      // Log activation/deactivation
      if (currentCafe.subscription_status !== status) {
        const actionType = status === 'active' 
          ? auditService.ACTION_TYPES.CAFE_ACTIVATED
          : auditService.ACTION_TYPES.CAFE_DEACTIVATED;
        
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
    
    console.log('Calling Cafe.update with:', updateData);
    const updatedCafe = await Cafe.update(cafeId, updateData);
    console.log('Cafe.update returned:', {
      id: updatedCafe.id,
      subscription_plan: updatedCafe.subscription_plan,
      subscription_status: updatedCafe.subscription_status
    });
    
    return updatedCafe;
  } catch (error) {
    throw new Error(`Error updating cafe subscription: ${error.message}`);
  }
}

/**
 * Toggle a specific module for a cafe (Super Admin override)
 * DEPRECATED: Use featureService.toggleCafeFeature instead
 */
async function toggleCafeModule(cafeId, module, enabled) {
  try {
    // Use new feature service
    const previousValue = await featureService.cafeHasFeature(cafeId, module);
    
    await featureService.toggleCafeFeature(cafeId, module, enabled);
    
    // Log feature change
    await auditService.logAuditEvent(
      cafeId,
      enabled ? auditService.ACTION_TYPES.FEATURE_ENABLED : auditService.ACTION_TYPES.FEATURE_DISABLED,
      previousValue ? 'enabled' : 'disabled',
      enabled ? 'enabled' : 'disabled',
      null // changedBy will be set by API endpoint
    );
    
    return await featureService.resolveCafeFeatures(cafeId);
  } catch (error) {
    throw new Error(`Error toggling cafe module: ${error.message}`);
  }
}

module.exports = {
  PLANS,
  STATUSES,
  MODULES,
  PLAN_FEATURES,
  getAllModules,
  getAllPlans,
  getAllStatuses,
  getPlanFeatures,
  planHasModule,
  getCafeSubscription,
  cafeHasModuleAccess,
  updateCafeSubscription,
  toggleCafeModule
};
