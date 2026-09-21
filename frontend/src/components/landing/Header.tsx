import { useState } from "react";
import { NAV_LINKS } from "./data";
import { CloseIcon, MenuIcon } from "./icons";

function NavItem({
  link,
  whatsappHref,
  onOpenContact,
  onNavigate,
  className,
}: {
  link: (typeof NAV_LINKS)[number];
  whatsappHref: string | null;
  onOpenContact: () => void;
  onNavigate: () => void;
  className: string;
}) {
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
        {link.label}
      </button>
    );
  }

  if (link.kind === "whatsapp") {
    if (!whatsappHref) return null;
    return (
      <a href={whatsappHref} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className}>
        {link.label}
      </a>
    );
  }

  return (
    <a href={link.href} onClick={onNavigate} className={className}>
      {link.label}
    </a>
  );
}

export function Header({
  whatsappHref,
  onOpenContact,
}: {
  whatsappHref: string | null;
  onOpenContact: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="#home" className="text-xl font-bold tracking-tight text-[#1A1A1A]">
          Cinzel <span className="text-[#1B3A6B]">e a Gema</span>
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavItem
              key={link.label}
              link={link}
              whatsappHref={whatsappHref}
              onOpenContact={onOpenContact}
              onNavigate={() => {}}
              className="text-sm font-medium text-[#64748B] transition hover:text-[#1B3A6B]"
            />
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          className="text-[#1A1A1A] lg:hidden"
        >
          {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-[#E2E8F0] bg-white px-4 pb-4 lg:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {NAV_LINKS.map((link) => (
              <NavItem
                key={link.label}
                link={link}
                whatsappHref={whatsappHref}
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
