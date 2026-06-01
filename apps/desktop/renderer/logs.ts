(function () {
  type LogControllerElements = {
    logBox: HTMLElement;
  };

  function createLogController({ logBox }: LogControllerElements) {
    function append(message: string) {
      logBox.innerHTML += `${message}<br>`;
      logBox.scrollTop = logBox.scrollHeight;
    }

    function sanitize(message: string) {
      return message.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
    }

    return {
      append,
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
