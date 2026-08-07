export type ReadinessConfiguration = {
  sharedRateLimitStoreConfigured: boolean;
  sharedRateLimitStoreRequired: boolean;
  supabaseConfigured: boolean;
  webOriginsConfigured: boolean;
};

async function withDeadline(check: () => Promise<boolean>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([check().catch(() => false), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}

export function createCheckReadiness(dependencies: { checkRateLimitStore(): Promise<boolean>; checkSupabase(): Promise<boolean>; timeoutMs: number }) {
  return async (configuration: ReadinessConfiguration) => {
    const [supabaseReachable, sharedRateLimitStoreReachable] = await Promise.all([
      configuration.supabaseConfigured ? withDeadline(dependencies.checkSupabase, dependencies.timeoutMs) : false,
      configuration.sharedRateLimitStoreConfigured ? withDeadline(dependencies.checkRateLimitStore, dependencies.timeoutMs) : !configuration.sharedRateLimitStoreRequired,
    ]);
    const checks = {
      sharedRateLimitStoreConfigured: !configuration.sharedRateLimitStoreRequired || configuration.sharedRateLimitStoreConfigured,
      sharedRateLimitStoreReachable,
      supabaseConfigured: configuration.supabaseConfigured,
      supabaseReachable,
      webOrigins: configuration.webOriginsConfigured,
    };
    return { checks, ok: Object.values(checks).every(Boolean) };
  };
}
