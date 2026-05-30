export function initClientObservability() {
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!sentryDsn) {
    return;
  }

  // Phase 0 baseline: wire environment entrypoint without hard dependency on Sentry SDK.
  // Full Sentry SDK setup is completed in Phase 2.5 deployment/release work.
  console.info('[observability] Sentry DSN configured for client telemetry baseline.');
}
