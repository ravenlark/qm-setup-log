import type { ReactNode } from "react";
import { Settings } from "lucide-react";
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
  const brand = (
    <>
      <div
        className={teamLogoUrl ? "brand-mark brand-mark-logo" : "brand-mark"}
        aria-hidden="true"
      >
        {teamLogoUrl ? <img alt="" src={teamLogoUrl} /> : <Settings size={20} />}
      </div>
      <div>
        <h1>My Setup Log</h1>
        <p>Quarter midget race notes</p>
      </div>
    </>
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
