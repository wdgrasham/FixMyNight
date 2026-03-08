import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../routes';

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const links = [
    { to: '/#tools', label: 'Tools' },
    { to: ROUTES.LEGAL, label: 'Legal Info' },
    { to: ROUTES.CONTACT, label: 'Contact' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Navbar — matches V0 landing/product design */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#0F172A]/90 backdrop-blur-xl border-b border-[#1E293B] shadow-lg shadow-[#0F172A]/10'
            : 'bg-white/80 backdrop-blur-xl border-b border-[#E2E8F0]'
        }`}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <Link to={ROUTES.LANDING} className="flex items-center gap-2.5">
            <img src="/FixMyDayIcon.png" alt="FixMyDay.ai" className="object-contain" width="64" height="64" />
            <span className={`font-semibold text-lg tracking-tight transition-colors duration-300 ${scrolled ? 'text-[#F8FAFC]' : 'text-[#0F172A]'}`}>
              FixMyDay<span className="text-[#F59E0B]">.ai</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm transition-colors duration-300 ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/#tools"
              className="inline-flex items-center justify-center rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#D97706] transition-colors"
            >
              Explore Tools
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className={`md:hidden transition-colors ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className={`md:hidden border-t px-6 py-4 flex flex-col gap-4 ${scrolled ? 'border-[#1E293B] bg-[#0F172A]/95 backdrop-blur-xl' : 'border-[#E2E8F0] bg-white/95 backdrop-blur-xl'}`}>
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm transition-colors ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/#tools"
              className="inline-flex items-center justify-center rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#D97706] transition-colors"
            >
              Explore Tools
            </Link>
          </div>
        )}
      </nav>

      {/* Page content — offset for fixed nav */}
      <main className="flex-1 pt-20">
        <Outlet />
      </main>

      {/* Curved divider into footer */}
      <div className="relative -mt-px bg-[#F8FAFC]">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto" preserveAspectRatio="none">
          <path d="M0,0 C360,60 1080,60 1440,0 L1440,60 L0,60 Z" fill="#0B1120" />
        </svg>
      </div>

      {/* Footer — matches V0 landing design */}
      <footer className="bg-[#0B1120] py-10 -mt-px">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs text-[#64748B] leading-relaxed max-w-3xl mb-6">
            FixMyDay.ai provides AI-generated informational tools and automation services.
            Outputs are for informational purposes only and do not constitute legal,
            financial, or professional advice. For advice specific to your situation,
            consult a licensed professional.
          </p>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-[#1E293B] pt-6">
            <div className="flex items-center gap-2.5">
              <img src="/FixMyDayIcon.png" alt="FixMyDay.ai" className="h-5 w-5 object-contain" />
              <span className="text-sm text-[#64748B]">&copy; 2026 FixMyDay.ai</span>
            </div>
            <div className="flex items-center gap-6">
              <Link to={ROUTES.PRIVACY} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Privacy Policy</Link>
              <Link to={ROUTES.TERMS} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Terms &amp; Conditions</Link>
              <Link to={ROUTES.LEGAL} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Legal Info</Link>
              <Link to={ROUTES.CONTACT} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
