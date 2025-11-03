import { Button } from "../button";
import { RiGithubFill } from "react-icons/ri";
import { useAuth } from "@/hooks/useAuth";

export function LoginButton() {
  const { login } = useAuth();

  return (
    <Button
      onClick={login}
      className="w-full h-18 max-w-md mx-auto text-white font-medium py-6 transition-all duration-200 flex items-center justify-center gap-3 rounded-lg"
      size="lg"
    >
      <RiGithubFill className="size-8" />
      <span className="text-lg">Continue with GitHub</span>
    </Button>
  );
}
