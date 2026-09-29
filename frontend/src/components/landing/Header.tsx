import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import logo from "../../assets/logo.png";
import { NAV_LINKS } from "./data";
import { CloseIcon, MenuIcon } from "./icons";
import { LanguageSwitcher } from "./LanguageSwitcher";

function NavItem({
  link,
  onOpenContact,
  onNavigate,
  className,
}: {
  link: (typeof NAV_LINKS)[number];
  onOpenContact: () => void;
  onNavigate: () => void;
  className: string;
}) {
  const { t } = useTranslation();

  if (link.kind === "modal") {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate();
          onOpenContact();
        }}
        className={className}
      >
        {t(link.labelKey)}
      </button>
    );
  }

  if (link.kind === "route") {
    return (
      <Link to={link.to} onClick={onNavigate} className={className}>
        {t(link.labelKey)}
      </Link>
    );
  }

  return (
    <a href={link.href} onClick={onNavigate} className={className}>
      {t(link.labelKey)}
    </a>
  );
}

export function Header({ onOpenContact }: { onOpenContact: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="/#home" className="flex items-center">
          <img src={logo} alt={t("header.logoAlt")} className="h-12 w-auto object-contain" />
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavItem
              key={link.labelKey}
              link={link}
              onOpenContact={onOpenContact}
              onNavigate={() => {}}
              className="text-sm font-medium text-[#64748B] transition hover:text-[#1B3A6B]"
            />
          ))}
          <LanguageSwitcher className="ml-2 border-l border-[#E2E8F0] pl-4" />
        </nav>

        <div className="flex items-center gap-3 lg:hidden">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
            aria-expanded={open}
            className="text-[#1A1A1A]"
          >
            {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-[#E2E8F0] bg-white px-4 pb-4 lg:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {NAV_LINKS.map((link) => (
              <NavItem
                key={link.labelKey}
                link={link}
                onOpenContact={onOpenContact}
                onNavigate={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-left text-sm font-medium text-[#1A1A1A] hover:bg-[#F1F5F9]"
              />
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
