import { createRoot } from "react-dom/client";
import "../../shared/theme.css";
import { initPrefs } from "../../shared/Prefs.jsx";
import "./book.css";
import Book from "./Book.jsx";

initPrefs();
createRoot(document.getElementById("root")).render(<Book />);
