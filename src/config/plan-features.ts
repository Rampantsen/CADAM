// Marketing copy for each plan tier. Self-hosted deployments use unlimited
// local credits, but these labels remain for hosted/product builds.

export type PlanLevel = 'free' | 'standard' | 'pro';

type PlanCopy = {
  description: string;
  features: string[];
};

export const PLAN_FEATURES: Record<PlanLevel, PlanCopy> = {
  free: {
    description: 'Get started with Adam',
    features: ['All AI features', 'Community support'],
  },
  standard: {
    description: 'For regular use',
    features: [
      'All AI features',
      'Tokens shared between CADAM and the Onshape extension',
    ],
  },
  pro: {
    description: 'For power users',
    features: [
      'All AI features',
      'Priority support',
      'Tokens shared between CADAM and the Onshape extension',
    ],
  },
};

export const PLAN_DISPLAY_NAMES: Record<PlanLevel, string> = {
  free: 'Free',
  standard: 'Standard',
  pro: 'Pro',
};

export const PLAN_ORDER: PlanLevel[] = ['free', 'standard', 'pro'];
