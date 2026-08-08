(function () {
  const MAX_LOG_ENTRIES = 500;
  const ANSI_ESCAPE_PATTERN = new RegExp(
    `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
    "g",
  );

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
      return message.replace(ANSI_ESCAPE_PATTERN, "");
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
