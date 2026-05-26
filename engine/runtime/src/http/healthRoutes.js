function registerHealthRoutes(app, getHealthSnapshot) {
  app.get("/health", (req, res) => {
    const snapshot = getHealthSnapshot();
    res.status(snapshot.ok ? 200 : 503).json(snapshot);
  });
}

module.exports = { registerHealthRoutes };
