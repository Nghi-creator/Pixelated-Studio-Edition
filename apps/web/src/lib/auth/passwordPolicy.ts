export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_POLICY_HINT =
  "Password should contain at least 8 characters, 1 letter and 1 number.";

export function getPasswordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number.";
  }

  return null;
}
