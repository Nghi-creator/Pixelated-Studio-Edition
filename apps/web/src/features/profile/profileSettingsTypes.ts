export type ProfileMessage = {
  type: "success" | "warning" | "error";
  text: string;
};

export type PasswordMessage = {
  type: "success" | "error";
  text: string;
};
