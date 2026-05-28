(function () {
  function bindDocsModal({ closeButton, modal, openButton }) {
    function open() {
      modal.classList.remove("opacity-0", "pointer-events-none");
    }

    function close() {
      modal.classList.add("opacity-0", "pointer-events-none");
    }

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
  }

  window.PixelatedModal = {
    bindDocsModal,
  };
})();
