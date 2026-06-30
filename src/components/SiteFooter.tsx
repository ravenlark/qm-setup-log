import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link to="/privacy-policy">Privacy Policy</Link>
      <span>&copy; {new Date().getFullYear()} My Setup Log</span>
    </footer>
  );
}
