import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link to="/">Home</Link>
      <Link to="/pricing">Pricing</Link>
      <Link to="/privacy-policy">Privacy Policy</Link>
      <span>&copy; {new Date().getFullYear()} My Setup Log</span>
    </footer>
  );
}
