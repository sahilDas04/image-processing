import { useEffect, useRef, useState } from "react";
import { Link, useLocation, NavLink } from "react-router";
import { IconSparkles, IconMenu, IconX, IconLogout, IconChevronDown, IconInfoCircle, IconHistory } from "@tabler/icons-react";

import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  path: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Home" },
  { path: "/history", label: "History" },
  { path: "/about", label: "About" },
];

interface DropdownItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  href?: string;
}

export function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [prevLocation, setPrevLocation] = useState(location);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Close any open menu when the route changes (render-phase reset, avoids
  // cascading setState inside an effect).
  if (location !== prevLocation) {
    setPrevLocation(location);
    setIsMobileMenuOpen(false);
    setIsAccountMenuOpen(false);
  }

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close account menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initials fallback for avatar
  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email
      ? user.email[0].toUpperCase()
      : "U";

  // Dropdown items for profile menu
  const dropdownItems: DropdownItem[] = [
    {
      label: "About",
      icon: <IconInfoCircle className="size-4" aria-hidden="true" />,
      onClick: () => {
        setIsAccountMenuOpen(false);
        // Could navigate to about page or show modal
      },
      href: "/about",
    },
    {
      label: "History",
      icon: <IconHistory className="size-4" aria-hidden="true" />,
      onClick: () => {
        setIsAccountMenuOpen(false);
      },
      href: "/history",
    },
    {
      label: "Logout",
      icon: <IconLogout className="size-4" aria-hidden="true" />,
      onClick: () => {
        logout();
        setIsAccountMenuOpen(false);
      },
    },
  ];

  // Pill navbar classes
  const pillClass = cn(
    "fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out",
    "backdrop-blur-2xl border border-white/30 shadow-[0_8px_32px_rgba(90,70,160,0.12)]",
    "rounded-full",
    isScrolled
      ? "top-4 h-14 bg-white/50 shadow-[0_12px_40px_rgba(90,70,160,0.18)]"
      : "top-6 h-16 bg-white/35",
    "max-w-[700px] w-auto px-3",
  );

  const innerClass = cn(
    "flex items-center justify-between h-full transition-all duration-300",
    isScrolled ? "gap-3 px-2" : "gap-4 px-3",
  );

  return (
    <>
      <header className={pillClass} role="navigation" aria-label="Main navigation">
        <div className={innerClass}>
          {/* Logo / Brand - links to Home */}
          <Link
            to="/"
            className={cn(
              "flex items-center gap-2.5 shrink-0 transition-all duration-300",
              isScrolled ? "gap-2" : "gap-2.5",
            )}
            aria-label="Image Lab Home"
          >
            <div
              className={cn(
                "shrink-0 grid place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg transition-all duration-300",
                isScrolled ? "size-8" : "size-9",
              )}
              aria-hidden="true"
            >
              <IconSparkles
                className={cn("transition-all duration-300", isScrolled ? "size-4" : "size-4.5")}
                aria-hidden="true"
              />
            </div>
            <span className={cn(
              "hidden sm:block font-bold text-foreground transition-all duration-300",
              isScrolled ? "text-sm" : "text-base",
            )}>
              IMAGE LAB
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }: { isActive: boolean }) => cn(
                  "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-white/40 hover:text-foreground",
                  isActive
                    ? "text-primary bg-primary/10 shadow-[0_0_12px_rgba(90,70,160,0.3)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {({ isActive }: { isActive: boolean }) => (
                  <>
                    {item.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" aria-hidden="true" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Desktop Account Section */}
          {isAuthenticated && (
            <div className="relative hidden lg:flex items-center" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-200",
                  "glass-highlight bg-white/30 text-foreground border-white/40 shadow-sm",
                  "hover:bg-white/40 hover:border-white/60 hover:shadow-[0_4px_16px_rgba(90,70,160,0.15)]",
                  isAccountMenuOpen && "bg-white/50 border-white/60",
                )}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="true"
                aria-label="Account menu"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className={cn("rounded-full bg-white/20 transition-all duration-300", isScrolled ? "size-6" : "size-7")}
                  />
                ) : (
                  <div className={cn(
                    "grid place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-white font-medium transition-all duration-300",
                    isScrolled ? "size-6 text-[10px]" : "size-7 text-xs",
                  )}>
                    {userInitials}
                  </div>
                )}
                <span className={cn(
                  "hidden sm:block truncate font-medium transition-all duration-200",
                  isScrolled ? "text-xs max-w-[120px]" : "text-sm max-w-[160px]",
                )}>
                  {user?.name ?? user?.email}
                </span>
                <IconChevronDown className={cn(
                  "size-3.5 transition-transform duration-200",
                  isAccountMenuOpen && "rotate-180",
                )} aria-hidden="true" />
              </button>

              {/* Account Dropdown */}
              {isAccountMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-4 glass-menu rounded-2xl border border-white/40 py-1 shadow-[0_12px_40px_rgba(90,70,160,0.2)] animate-scale-in"
                  style={{ minWidth: "220px" }}
                  role="menu"
                  aria-label="Account options"
                >
                  <div className="px-4 py-3 border-b border-white/20">
                    <p className="text-sm font-medium text-foreground truncate">{user?.name ?? "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  {dropdownItems.map((item) => (
                    item.href ? (
                      <Link
                        key={item.label}
                        to={item.href}
                        onClick={item.onClick}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-white/30 transition-colors"
                        role="menuitem"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-white/30 transition-colors text-left"
                        role="menuitem"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden glass-highlight grid size-10 place-items-center rounded-xl bg-white/30 text-foreground border-white/40 shadow-sm hover:bg-white/40 hover:border-white/60 transition-all"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? <IconX className="size-5" aria-hidden="true" /> : <IconMenu className="size-5" aria-hidden="true" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isAuthenticated && isMobileMenuOpen && (
          <div
            id="mobile-menu"
            className="lg:hidden absolute left-1/2 -translate-x-1/2 top-full mt-2 w-full max-w-[700px] px-3 glass-menu rounded-2xl border border-white/40 shadow-[0_12px_40px_rgba(90,70,160,0.2)] animate-slide-down"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="py-3 space-y-2">
              {/* Navigation Links */}
              <nav className="px-2 pb-3 border-b border-white/20" aria-label="Main">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }: { isActive: boolean }) => cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-white/30 hover:text-foreground",
                      )}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              {/* Account Section */}
              <div className="px-2 py-3 space-y-2">
                <div className="flex items-center gap-3 rounded-xl px-3 py-3 glass-control">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="size-10 rounded-full bg-white/20" />
                  ) : (
                    <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-white font-medium">
                      {userInitials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user?.name ?? "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
                {dropdownItems.map((item) => (
                    item.href ? (
                      <Link
                        key={item.label}
                        to={item.href}
                        onClick={item.onClick}
                        className="w-full flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-foreground bg-white/30 border border-white/40 shadow-sm hover:bg-white/40 hover:border-white/60 transition-all"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className="w-full flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-foreground bg-white/30 border border-white/40 shadow-sm hover:bg-white/40 hover:border-white/60 transition-all text-left"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    )
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Backdrop */}
        {isMobileMenuOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
      </header>

      {/* Spacer to prevent content from being hidden behind fixed navbar */}
      <div
        className={cn("transition-all duration-300 pointer-events-none", isScrolled ? "h-16" : "h-20")}
        aria-hidden="true"
      />
    </>
  );
}