export function logScreenError(screen: string, error: unknown, details?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const requestDetails =
    error &&
    typeof error === 'object' &&
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null
      ? error.details
      : {};
  const payload = { screen, message, details: { ...requestDetails, ...details } };

  if (__DEV__) {
    console.error('[ScreenError]', payload, error);
  } else {
    console.warn('[ScreenError]', payload);
  }
}
