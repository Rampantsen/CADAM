const localAbortControllers = new Map<string, AbortController>();

export function registerLocalAbortController(
  requestId: string,
  controller: AbortController,
) {
  localAbortControllers.set(requestId, controller);

  return () => {
    if (localAbortControllers.get(requestId) === controller) {
      localAbortControllers.delete(requestId);
    }
  };
}

export function abortRegisteredLocalRequest(requestId: string) {
  const controller = localAbortControllers.get(requestId);
  if (!controller) return false;
  controller.abort();
  localAbortControllers.delete(requestId);
  return true;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
