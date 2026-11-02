/** Private disposable-fixture read route; never installed by the normal server. */
const { timingSafeEqual } = require('node:crypto');

function createRawObservationTelemetry({ token, camera, createSnapshot, readCounters }) {
  let snapshot, identities, failed = false;
  const sessionId = 'native_acceptance';
  function current() {
    return !failed && camera.exitCode === null && camera.signalCode === null &&
      identities.every(([pid, start]) => readCounters(pid)?.startTimeTicks === start);
  }
  return {
    initialize(event) {
      if (snapshot || failed || !event || event.kind !== 'n11_raw_identity' ||
          !Number.isSafeInteger(event.game_pid) || event.game_pid <= 1 ||
          typeof event.telemetry_path !== 'string' ||
          !/^\/tmp\/tmp[A-Za-z0-9_-]+\/telemetry\.json$/.test(event.telemetry_path) ||
          !Number.isSafeInteger(camera.pid) || camera.pid <= 1) throw Error('invalid raw identity');
      const ids = [process.pid, camera.pid, event.game_pid];
      if (new Set(ids).size !== 3) throw Error('raw process roles overlap');
      identities = ids.map(pid => {
        const sample = readCounters(pid);
        if (!sample || !Number.isSafeInteger(sample.startTimeTicks)) throw Error('raw process unavailable');
        return [pid, sample.startTimeTicks];
      });
      snapshot = createSnapshot({ cameraTelemetryStatePath: event.telemetry_path,
        runtimeKind: 'native_linux', getRuntimeState: () => current() ? {
          activeSessionId: sessionId, cameraPeerStatePath: event.telemetry_path.replace('telemetry.json','peers.json'), cameraProcess: {pid: camera.pid},
          retroarchProcess: {pid: event.game_pid},
        } : {activeSessionId: null} });
    },
    handle(req, res) {
      if (req.url !== '/n11-raw-observation') return false;
      const supplied = Buffer.from(String(req.headers.authorization || ''));
      const expected = Buffer.from('Bearer ' + token);
      const authorized = supplied.length === expected.length && timingSafeEqual(supplied, expected);
      let body = null;
      if (req.method === 'GET' && authorized && snapshot && current()) body = snapshot(sessionId);
      const status = req.method !== 'GET' ? 405 : !authorized ? 403 : !body ? 503 : 200;
      res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
      res.end(JSON.stringify(body || {unavailable:true}));
      return true;
    },
    stop() { failed = true; snapshot?.stop(); },
  };
}
module.exports = { createRawObservationTelemetry };
