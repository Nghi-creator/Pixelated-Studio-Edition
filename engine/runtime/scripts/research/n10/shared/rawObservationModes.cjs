/** Raw browser assets and the protected telemetry route use the same closed mode gate. */
const {physicalChallengeSelection} = require('../../n11/protocols/physicalChallengeModes.cjs');
function supportsRawObservation(mode) {
  return typeof mode === 'string' && (
    ['n11-raw-observation','engineering-n11-paired-observation','engineering-n11-contention-paired',
      'engineering-n11-pacing-paired','engineering-n11-pacing-contrast'].includes(mode) ||
    /^engineering-n11-capacity-(calibration|confirmation)-([0-7])$/.test(mode) ||
    /^engineering-n11-(?:resource-)?condition-(no_injected_fault|owned_identity_delay|owned_cpu_pressure)$/.test(mode) ||
    physicalChallengeSelection(mode) !== null
  );
}
module.exports = {supportsRawObservation};
