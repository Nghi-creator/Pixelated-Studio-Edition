(function () {
  const MAX_LOG_ENTRIES = 500;

  type LogControllerElements = {
    logBox: HTMLElement;
  };

  function createLogController({ logBox }: LogControllerElements) {
    function append(message: string) {
      const plainMessage = message.replace(
        /<span(?: class="[^"]*")?>|<\/span>/g,
        "",
      );
      logBox.append(
        document.createTextNode(plainMessage),
        document.createElement("br"),
      );
      while (logBox.childNodes.length > MAX_LOG_ENTRIES * 2) {
        if (logBox.firstChild) logBox.removeChild(logBox.firstChild);
        if (logBox.firstChild) logBox.removeChild(logBox.firstChild);
      }
      logBox.scrollTop = logBox.scrollHeight;
    }

    function clear() {
      logBox.replaceChildren();
    }

    function sanitize(message: string) {
      return message.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
    }

    return {
      append,
      clear,
      sanitize,
    };
  }

  (window as unknown as Window & {
    PixelatedLogs: {
      createLogController: typeof createLogController;
      maxEntries: number;
    };
  }).PixelatedLogs = {
    createLogController,
    maxEntries: MAX_LOG_ENTRIES,
  };
})();
