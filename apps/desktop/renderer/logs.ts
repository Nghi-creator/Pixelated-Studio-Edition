(function () {
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
    };
  }).PixelatedLogs = {
    createLogController,
  };
})();
