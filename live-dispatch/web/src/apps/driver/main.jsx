import { createRoot } from "react-dom/client";
import "../../shared/theme.css";
import { initPrefs } from "../../shared/Prefs.jsx";
import "./driver.css";
import Driver from "./Driver.jsx";

initPrefs();
createRoot(document.getElementById("root")).render(<Driver />);
