import "./style.css";
import { initGame } from "./game/bootstrap";

initGame(document.querySelector<HTMLDivElement>("#app")!);
