type BeforeQuitEvent = {
  preventDefault: () => void;
};

export function createShutdownCoordinator(
  cleanup: () => Promise<void>,
  quit: () => void,
) {
  let cleanupComplete = false;
  let cleanupPromise: Promise<void> | null = null;

  return {
    handleBeforeQuit(event: BeforeQuitEvent) {
      if (cleanupComplete) return;

      event.preventDefault();
      if (!cleanupPromise) {
        cleanupPromise = cleanup()
          .catch(() => undefined)
          .then(() => {
            cleanupComplete = true;
            quit();
          });
      }
    },
  };
}
