// Self-hosted billing adapter. CADAM still keeps Supabase Auth and user-scoped
// data access, but deployment no longer depends on the external adam-billing
// service. All authenticated users receive effectively unlimited credits.

export type SubscriptionLevel = 'standard' | 'pro';

export type BillingStatus = {
  user: {
    hasTrialed: boolean;
  };
  subscription: {
    level: SubscriptionLevel;
    status: string | null;
    currentPeriodEnd: string | null;
  } | null;
  tokens: {
    free: number;
    subscription: number;
    purchased: number;
    total: number;
  };
};

export type ConsumeSuccess = {
  ok: true;
  tokensDeducted: number;
  freeBalance: number;
  subscriptionBalance: number;
  purchasedBalance: number;
  totalBalance: number;
};

export type ConsumeFailure = {
  ok: false;
  reason: 'insufficient_tokens';
  tokensRequired: number;
  tokensAvailable: number;
  tokensDeducted: number;
};

export type ConsumeResult = ConsumeSuccess | ConsumeFailure;

export type RefundResult = {
  ok: true;
  tokensRefunded: number;
  source: 'subscription' | 'purchased';
  freeBalance: number;
  subscriptionBalance: number;
  purchasedBalance: number;
  totalBalance: number;
};

export type BillingProduct = {
  id: string;
  stripeProductId: string;
  stripePriceId: string;
  productType: 'subscription' | 'pack';
  subscriptionLevel: SubscriptionLevel | null;
  tokenAmount: number;
  name: string;
  priceCents: number;
  interval: string | null;
  active: boolean;
};

export class BillingClientError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const UNLIMITED_TOKENS = 999_999_999;

const selfHostedStatus = (): BillingStatus => ({
  user: {
    hasTrialed: true,
  },
  subscription: {
    level: 'pro',
    status: 'active',
    currentPeriodEnd: null,
  },
  tokens: {
    free: UNLIMITED_TOKENS,
    subscription: 0,
    purchased: 0,
    total: UNLIMITED_TOKENS,
  },
});

const selfHostedSuccess = (tokens = 0): ConsumeSuccess => ({
  ok: true,
  tokensDeducted: tokens,
  freeBalance: UNLIMITED_TOKENS,
  subscriptionBalance: 0,
  purchasedBalance: 0,
  totalBalance: UNLIMITED_TOKENS,
});

const appUrl = (): string => Deno.env.get('ADAM_URL') ?? '/';

type ConsumeBody = {
  tokens: number;
  operation?: string;
  referenceId?: string;
};

type RefundBody = {
  tokens: number;
  operation?: string;
  referenceId?: string;
};

type CheckoutBody = {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialPeriodDays?: number;
};

type CancelSubscriptionBody = {
  feedback?:
    | 'customer_service'
    | 'low_quality'
    | 'missing_features'
    | 'other'
    | 'switched_service'
    | 'too_complex'
    | 'too_expensive'
    | 'unused';
  comment?: string;
};

export type CancelSubscriptionResult =
  | { canceled: true }
  | { canceled: false; reason: 'no_subscription' | 'already_canceled' };

export const billing = {
  getStatus: (_email: string): Promise<BillingStatus> =>
    Promise.resolve(selfHostedStatus()),

  consume: (_email: string, body: ConsumeBody): Promise<ConsumeResult> =>
    Promise.resolve(selfHostedSuccess(body.tokens)),

  refund: (_email: string, body: RefundBody): Promise<RefundResult> =>
    Promise.resolve({
      ...selfHostedSuccess(0),
      tokensRefunded: body.tokens,
      source: 'purchased',
    }),

  createCheckout: (
    _email: string,
    _body: CheckoutBody,
  ): Promise<{ url: string }> => Promise.resolve({ url: appUrl() }),

  createPortal: (
    _email: string,
    body: { returnUrl: string },
  ): Promise<{ url: string }> => Promise.resolve({ url: body.returnUrl }),

  cancelSubscription: (
    _email: string,
    _body: CancelSubscriptionBody = {},
  ): Promise<CancelSubscriptionResult> =>
    Promise.resolve({ canceled: false, reason: 'no_subscription' }),

  getProductsByType: (
    _type: 'subscription' | 'pack',
  ): Promise<BillingProduct[]> => Promise.resolve([]),

  getAllProducts: (): Promise<{
    subscriptions: BillingProduct[];
    packs: BillingProduct[];
  }> => Promise.resolve({ subscriptions: [], packs: [] }),
};
