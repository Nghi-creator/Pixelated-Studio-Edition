(function () {
  function createLogController({ logBox }) {
    function append(message) {
      logBox.innerHTML += `${message}<br>`;
      logBox.scrollTop = logBox.scrollHeight;
    }

    function sanitize(message) {
      return message.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
    }

    return {
      append,
      sanitize,
    };
  }

  window.PixelatedLogs = {
    createLogController,
  };
})();
