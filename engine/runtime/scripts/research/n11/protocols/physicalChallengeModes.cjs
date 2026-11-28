/** Shared closed grammar for the host driver and container relay. */
const PHYSICAL_RECIPES = Object.freeze([
  "mixed_delay_pressure", "delay_to_pressure", "pressure_to_delay",
  "control_no_injected_fault", "control_owned_identity_delay", "control_owned_cpu_pressure",
]);
const PREFIX = "engineering-n11-physical-challenge-";
function physicalChallengeSelection(mode) {
  if (typeof mode !== "string" || !mode.startsWith(PREFIX)) return null;
  const recipe = mode.slice(PREFIX.length);
  return PHYSICAL_RECIPES.includes(recipe) ? recipe : null;
}
module.exports = {PHYSICAL_RECIPES, PREFIX, physicalChallengeSelection};
