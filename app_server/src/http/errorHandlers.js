function registerErrorHandlers(app) {
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    console.error("[HTTP] Unhandled engine route error:", err);
    res.status(500).json({ error: "Internal engine error" });
  });
}

module.exports = { registerErrorHandlers };
