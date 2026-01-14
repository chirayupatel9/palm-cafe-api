const Cafe = require('../models/cafe');
const Feature = require('../models/feature');

/**
 * Feature Service
 * 
 * Single source of truth for feature resolution logic.
 * Resolves features based on:
 * 1. Subscription plan
 * 2. Plan defaults (from features table)
 * 3. Cafe-specific overrides
 */

/**
 * Resolve all features for a cafe
 * Returns a map of feature_key -> enabled (boolean)
 */
async function resolveCafeFeatures(cafeId) {
  try {
    // Get cafe subscription info
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      throw new Error('Cafe not found');
    }

    const plan = cafe.subscription_plan || 'FREE';
    const status = cafe.subscription_status || 'active';

    // If subscription is not active, all features are disabled
    if (status !== 'active') {
      const allFeatures = await Feature.getAll();
      const featureMap = {};
      allFeatures.forEach(f => {
        featureMap[f.key] = false;
      });
      return featureMap;
    }

    // Get all features
    const allFeatures = await Feature.getAll();
    
    // Get cafe-specific overrides
    const overrides = await Feature.getCafeOverrides(cafeId);

    // Resolve each feature
    const featureMap = {};
    
    for (const feature of allFeatures) {
      // Check if there's a cafe override
      if (overrides.hasOwnProperty(feature.key)) {
        // MySQL returns 1/0 for BOOLEAN, convert to boolean
        const overrideValue = overrides[feature.key];
        featureMap[feature.key] = overrideValue === true || overrideValue === 1;
      } else {
        // Use plan default
        // MySQL returns 1/0 for BOOLEAN, convert to boolean
        if (plan === 'PRO') {
          featureMap[feature.key] = feature.default_pro === true || feature.default_pro === 1;
        } else {
          featureMap[feature.key] = feature.default_free === true || feature.default_free === 1;
        }
      }
    }
    
    return featureMap;
  } catch (error) {
    throw new Error(`Error resolving cafe features: ${error.message}`);
  }
}

/**
 * Check if a cafe has access to a specific feature
 */
async function cafeHasFeature(cafeId, featureKey) {
  try {
    const features = await resolveCafeFeatures(cafeId);
    const hasAccess = features[featureKey] === true;
    
    return hasAccess;
  } catch (error) {
    console.error('Error checking feature access:', error);
    return false;
  }
}

/**
 * Get feature resolution details (for debugging/admin)
 */
async function getFeatureResolutionDetails(cafeId) {
  try {
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      throw new Error('Cafe not found');
    }

    const plan = cafe.subscription_plan || 'FREE';
    const status = cafe.subscription_status || 'active';
    
    const allFeatures = await Feature.getAll();
    const overrides = await Feature.getCafeOverrides(cafeId);
    const resolvedFeatures = await resolveCafeFeatures(cafeId);

    const details = {
      cafe: {
        id: cafe.id,
        name: cafe.name,
        plan,
        status
      },
      features: allFeatures.map(feature => ({
        key: feature.key,
        name: feature.name,
        description: feature.description,
        planDefaults: {
          free: feature.default_free,
          pro: feature.default_pro
        },
        override: overrides.hasOwnProperty(feature.key) ? {
          enabled: overrides[feature.key]
        } : null,
        resolved: {
          enabled: resolvedFeatures[feature.key] || false,
          source: overrides.hasOwnProperty(feature.key) ? 'override' : 'plan'
        }
      }))
    };

    return details;
  } catch (error) {
    throw new Error(`Error getting feature resolution details: ${error.message}`);
  }
}

/**
 * Toggle a feature for a cafe (creates or updates override)
 */
async function toggleCafeFeature(cafeId, featureKey, enabled) {
  try {
    // Verify feature exists
    const feature = await Feature.getByKey(featureKey);
    if (!feature) {
      throw new Error(`Feature '${featureKey}' not found`);
    }

    // Set override
    await Feature.setCafeOverride(cafeId, featureKey, enabled);

    return await resolveCafeFeatures(cafeId);
  } catch (error) {
    throw new Error(`Error toggling cafe feature: ${error.message}`);
  }
}

/**
 * Remove feature override (revert to plan default)
 */
async function removeFeatureOverride(cafeId, featureKey) {
  try {
    await Feature.removeCafeOverride(cafeId, featureKey);
    return await resolveCafeFeatures(cafeId);
  } catch (error) {
    throw new Error(`Error removing feature override: ${error.message}`);
  }
}

module.exports = {
  resolveCafeFeatures,
  cafeHasFeature,
  getFeatureResolutionDetails,
  toggleCafeFeature,
  removeFeatureOverride
};
