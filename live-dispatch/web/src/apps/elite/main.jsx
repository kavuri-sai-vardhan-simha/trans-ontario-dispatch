import { createRoot } from "react-dom/client";
import "../../shared/theme.css";
import { initPrefs } from "../../shared/Prefs.jsx";
import "./elite.css";
import Elite from "./Elite.jsx";

initPrefs();
createRoot(document.getElementById("root")).render(<Elite />);
