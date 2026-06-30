import { LogIn } from "lucide-react";

type GoogleSignInButtonProps = {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
};

export function GoogleSignInButton({
  disabled = false,
  label = "Sign in with Google",
  onClick,
}: GoogleSignInButtonProps) {
  return (
    <button
      className="primary-button"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <LogIn size={18} />
      {label}
    </button>
  );
}
