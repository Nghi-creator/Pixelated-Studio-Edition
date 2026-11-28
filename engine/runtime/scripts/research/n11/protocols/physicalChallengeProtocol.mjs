/** Closed challenge acquisition names; no fixed-condition or diagnosis aliases. */
import modes from './physicalChallengeModes.cjs';
export const PHYSICAL_RECIPES = modes.PHYSICAL_RECIPES;
export const PHYSICAL_METHOD = "n11-physical-challenge-acquisition-v1";
export const PHYSICAL_ROLE = "engineering_challenge_raw_phases_no_pair_or_diagnostic_label";
const PREFIX = modes.PREFIX;
export function physicalChallengeMode(recipe) {
  if (typeof recipe !== "string" || !PHYSICAL_RECIPES.includes(recipe)) throw Error("closed physical challenge recipe required");
  return PREFIX + recipe;
}
export const physicalChallengeSelection = modes.physicalChallengeSelection;
