import StudyApp from "./study-app";
import { chatGPTSignInPath } from "./chatgpt-auth";
export default function Home() {
  return <StudyApp signInHref={chatGPTSignInPath("/")} />;
}
