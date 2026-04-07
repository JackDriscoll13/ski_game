import { createWelcomeScreen } from "./welcomeScreen";
import { startPlaySession } from "./playSession";

export function initGame(container: HTMLElement): void {
  container.classList.add("app-root");

  const welcome = createWelcomeScreen(container, (payload) => {
    welcome.destroy();
    const host = document.createElement("div");
    host.className = "game-canvas-host";
    host.dataset.mountainIds = payload.mountains.map((m) => m.id).join(" ");
    host.dataset.mountainNames = payload.mountains.map((m) => m.name).join(" · ");
    container.appendChild(host);
    startPlaySession(host, { mountains: payload.mountains });
  });
}
