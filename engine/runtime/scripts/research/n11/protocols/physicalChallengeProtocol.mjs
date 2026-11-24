/** Closed challenge acquisition names; no fixed-condition or diagnosis aliases. */
export const PHYSICAL_RECIPES = Object.freeze([
  "mixed_delay_pressure", "delay_to_pressure", "pressure_to_delay",
  "control_no_injected_fault", "control_owned_identity_delay", "control_owned_cpu_pressure",
]);
export const PHYSICAL_METHOD = "n11-physical-challenge-acquisition-v1";
export const PHYSICAL_ROLE = "engineering_challenge_raw_phases_no_pair_or_diagnostic_label";
const PREFIX = "engineering-n11-physical-challenge-";
export function physicalChallengeMode(recipe) {
  if (typeof recipe !== "string" || !PHYSICAL_RECIPES.includes(recipe)) throw Error("closed physical challenge recipe required");
  return PREFIX + recipe;
}
export function physicalChallengeSelection(mode) {
  if (typeof mode !== "string" || !mode.startsWith(PREFIX)) return null;
  const recipe = mode.slice(PREFIX.length);
  return PHYSICAL_RECIPES.includes(recipe) ? recipe : null;
}
