import Cafe from '../models/cafe';
import Feature, { FeatureRow } from '../models/feature';
import logger from '../config/logger';

/**
 * Feature Service
 * Single source of truth for feature resolution logic.
 * Resolves features based on subscription plan, plan defaults, and cafe-specific overrides.
 */

export async function resolveCafeFeatures(cafeId: number): Promise<Record<string, boolean>> {
  try {
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      throw new Error('Cafe not found');
    }

    const plan = cafe.subscription_plan ? cafe.subscription_plan.toUpperCase() : 'FREE';
    const status = cafe.subscription_status || 'active';

    if (status !== 'active') {
      const allFeatures = await Feature.getAll();
      const featureMap: Record<string, boolean> = {};
      allFeatures.forEach((f: FeatureRow) => {
        featureMap[f.key] = false;
      });
      return featureMap;
    }

    const allFeatures = await Feature.getAll();
    const overrides = await Feature.getCafeOverrides(cafeId);

    const featureMap: Record<string, boolean> = {};

    for (const feature of allFeatures) {
      if (Object.prototype.hasOwnProperty.call(overrides, feature.key)) {
        featureMap[feature.key] = overrides[feature.key] === true;
      } else {
        if (plan === 'PRO') {
          featureMap[feature.key] = feature.default_pro === true;
        } else {
          featureMap[feature.key] = feature.default_free === true;
        }
      }
    }

    return featureMap;
  } catch (error) {
    throw new Error(`Error resolving cafe features: ${(error as Error).message}`);
  }
}

export async function cafeHasFeature(cafeId: number, featureKey: string): Promise<boolean> {
  try {
    const features = await resolveCafeFeatures(cafeId);
    return features[featureKey] === true;
  } catch (error) {
    logger.error('Error checking feature access', { message: (error as Error).message });
    return false;
  }
}

export async function getFeatureResolutionDetails(cafeId: number): Promise<unknown> {
  try {
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      throw new Error('Cafe not found');
    }

    const plan = cafe.subscription_plan ? cafe.subscription_plan.toUpperCase() : 'FREE';
    const status = cafe.subscription_status || 'active';

    const allFeatures = await Feature.getAll();
    const overrides = await Feature.getCafeOverrides(cafeId);
    const resolvedFeatures = await resolveCafeFeatures(cafeId);

    return {
      cafe: {
        id: cafe.id,
        name: cafe.name,
        plan,
        status
      },
      features: allFeatures.map((feature: FeatureRow) => ({
        key: feature.key,
        name: feature.name,
        description: feature.description,
        planDefaults: {
          free: feature.default_free,
          pro: feature.default_pro
        },
        override: Object.prototype.hasOwnProperty.call(overrides, feature.key)
          ? { enabled: overrides[feature.key] }
          : null,
        resolved: {
          enabled: resolvedFeatures[feature.key] || false,
          source: Object.prototype.hasOwnProperty.call(overrides, feature.key) ? 'override' : 'plan'
        }
      }))
    };
  } catch (error) {
    throw new Error(`Error getting feature resolution details: ${(error as Error).message}`);
  }
}

export async function toggleCafeFeature(
  cafeId: number,
  featureKey: string,
  enabled: boolean
): Promise<Record<string, boolean>> {
  try {
    const feature = await Feature.getByKey(featureKey);
    if (!feature) {
      throw new Error(`Feature '${featureKey}' not found`);
    }

    await Feature.setCafeOverride(cafeId, featureKey, enabled);

    return await resolveCafeFeatures(cafeId);
  } catch (error) {
    throw new Error(`Error toggling cafe feature: ${(error as Error).message}`);
  }
}

export async function removeFeatureOverride(
  cafeId: number,
  featureKey: string
): Promise<Record<string, boolean>> {
  try {
    await Feature.removeCafeOverride(cafeId, featureKey);
    return await resolveCafeFeatures(cafeId);
  } catch (error) {
    throw new Error(`Error removing feature override: ${(error as Error).message}`);
  }
}
