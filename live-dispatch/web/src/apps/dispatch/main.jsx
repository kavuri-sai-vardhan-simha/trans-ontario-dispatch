import { createRoot } from "react-dom/client";
import "../../shared/theme.css";
import { initPrefs } from "../../shared/Prefs.jsx";
import "./dispatch.css";
import Dispatch from "./Dispatch.jsx";

initPrefs();
createRoot(document.getElementById("root")).render(<Dispatch />);
