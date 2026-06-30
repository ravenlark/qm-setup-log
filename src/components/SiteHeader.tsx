import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type SiteHeaderProps = {
  actions?: ReactNode;
  brandHref?: string;
  home?: boolean;
  mobileContent?: ReactNode;
  teamLogoUrl?: string | null;
};

export function SiteHeader({
  actions,
  brandHref,
  home = false,
  mobileContent,
  teamLogoUrl,
}: SiteHeaderProps) {
  const brandLogoSrc = teamLogoUrl || "/sitelogo.jpg";

  const brand = (
    <img
      className="brand-logo"
      alt={teamLogoUrl ? "Team logo" : "mysetuplog.com"}
      src={brandLogoSrc}
    />
  );

  return (
    <header className={home ? "topbar home-topbar" : "topbar"}>
      {brandHref ? (
        <Link className="brand brand-link" to={brandHref}>
          {brand}
        </Link>
      ) : (
        <div className="brand">{brand}</div>
      )}
      {actions}
      {mobileContent}
    </header>
  );
}
