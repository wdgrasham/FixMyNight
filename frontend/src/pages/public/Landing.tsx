import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';
import {
  Menu, X, ArrowRight, ArrowUpRight, Mail, Phone,
  FileText, Scale, Moon, Car,
  Zap, DollarSign, Shield,
} from 'lucide-react';

/* ─── Navbar ─── */
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const links = [
    { href: '#tools', label: 'Tools', isAnchor: true },
    { href: ROUTES.LEGAL, label: 'Legal Info', isAnchor: false },
    { href: '#contact', label: 'Contact', isAnchor: true },
  ];

  return (
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
          {links.map((link) =>
            link.isAnchor ? (
              <a
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors duration-300 ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                to={link.href}
                className={`text-sm transition-colors duration-300 ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              >
                {link.label}
              </Link>
            )
          )}
          <a
            href="#tools"
            className="inline-flex items-center justify-center rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#D97706] transition-colors"
          >
            Explore Tools
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          className={`md:hidden transition-colors ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className={`md:hidden border-t px-6 py-4 flex flex-col gap-4 ${scrolled ? 'border-[#1E293B] bg-[#0F172A]/95 backdrop-blur-xl' : 'border-[#E2E8F0] bg-white/95 backdrop-blur-xl'}`}>
          {links.map((link) =>
            link.isAnchor ? (
              <a
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                to={link.href}
                className={`text-sm transition-colors ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            )
          )}
          <a
            href="#tools"
            className="inline-flex items-center justify-center rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#D97706] transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            Explore Tools
          </a>
        </div>
      )}
    </nav>
  );
}

/* ─── Hero ─── */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative bg-white pt-32 pb-28 md:pt-44 md:pb-36">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{ backgroundImage: 'radial-gradient(circle, #CBD5E1 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-8 flex flex-col items-center gap-6">
            <img
              src="/FixMyDayLogo.png"
              alt="FixMyDay.ai — Smart Tools, Simpler Days"
              className="h-auto w-[280px] sm:w-[340px] md:w-[400px] object-contain"
            />
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08]">
            AI-Powered Tools for{' '}
            <span className="bg-gradient-to-r from-[#F59E0B] to-[#D97706] bg-clip-text text-transparent">Everyday Problems</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#64748B] md:text-xl">
            Smart, affordable AI tools built for service professionals and small businesses.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="#tools"
              className="group inline-flex items-center gap-2 rounded-lg bg-[#F59E0B] px-6 py-3.5 text-sm font-semibold text-[#0F172A] hover:bg-[#D97706] transition-all shadow-lg shadow-[#F59E0B]/25"
            >
              Explore Tools
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#trust"
              className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-6 py-3.5 text-sm font-medium text-[#0F172A] hover:border-[#CBD5E1] hover:bg-[#F8FAFC] transition-all"
            >
              Learn More
            </a>
          </div>
        </div>
      </div>

      {/* Curved divider */}
      <div className="relative -mt-px bg-white">
        <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto" preserveAspectRatio="none">
          <path d="M0,0 C360,100 1080,100 1440,0 L1440,100 L0,100 Z" fill="#0F172A" />
        </svg>
      </div>

      {/* Navy value-prop bar */}
      <div className="relative bg-[#0F172A] pb-16 md:pb-20 -mt-px">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-8 sm:grid-cols-3 text-center">
            {[
              { value: '4+', label: 'AI-Powered Tools' },
              { value: '24/7', label: 'Always Available' },
              { value: '100%', label: 'Privacy-First' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-[#F59E0B] md:text-4xl">{stat.value}</p>
                <p className="mt-1 text-sm text-[#94A3B8]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/20 to-transparent" />
      </div>
    </section>
  );
}

/* ─── Tools Grid ─── */
const tools = [
  {
    icon: FileText,
    title: 'Donation Report',
    description: 'AI-powered donation tracking and tax reporting. Generate clean, IRS-ready summaries from your giving history in seconds.',
    href: '/donation-report',
    badge: null,
  },
  {
    icon: Scale,
    title: 'Do I Have a Case?',
    description: 'AI legal case evaluation for potential clients. Get a quick, confidential assessment of your legal situation powered by AI analysis.',
    href: '/case-evaluation',
    badge: null,
  },
  {
    icon: Moon,
    title: 'FixMyNight',
    description: 'After-hours AI answering for service contractors. Never miss an emergency call again with 24/7 intelligent call handling.',
    href: ROUTES.FIXMYNIGHT_PRODUCT,
    badge: 'NEW',
  },
  {
    icon: Car,
    title: 'Collector Car Finder',
    description: 'AI-powered classic car search and valuation. Find your dream collector vehicle and get accurate market pricing instantly.',
    href: '/collector-car-finder',
    badge: null,
  },
];

function ToolsGrid() {
  return (
    <section id="tools" className="relative bg-[#F8FAFC] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Our Tools</p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
            AI tools built for real problems
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#64748B]">
            Each tool is designed to save you time, money, and headaches.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.title}
              to={tool.href}
              className="group relative rounded-2xl border border-[#E2E8F0] bg-white p-8 transition-all duration-300 hover:border-[#F59E0B]/50 hover:shadow-xl hover:shadow-[#F59E0B]/5 hover:-translate-y-1"
            >
              {tool.badge && (
                <span className="absolute top-6 right-6 inline-flex items-center rounded-full bg-[#F59E0B]/10 px-2.5 py-0.5 text-xs font-bold tracking-wide text-[#D97706]">
                  {tool.badge}
                </span>
              )}
              <div className="mb-5 inline-flex items-center justify-center rounded-xl bg-[#0F172A] p-3 text-[#F59E0B] transition-colors duration-300 group-hover:bg-[#F59E0B] group-hover:text-[#0F172A]">
                <tool.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-[#0F172A] mb-2 flex items-center gap-2">
                {tool.title}
                <ArrowUpRight className="h-4 w-4 text-[#CBD5E1] transition-all duration-300 group-hover:text-[#F59E0B] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </h3>
              <p className="text-[#64748B] leading-relaxed">{tool.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Trust Section ─── */
const pillars = [
  { icon: Zap, title: 'Fast', description: 'Instant AI-powered results. No waiting, no back-and-forth. Get answers and insights in seconds, not days.' },
  { icon: DollarSign, title: 'Affordable', description: 'Enterprise-grade AI at small-business prices. No hidden fees, no long-term contracts. Pay only for what you use.' },
  { icon: Shield, title: 'Secure', description: 'Your data stays yours. End-to-end encryption, no third-party sharing, and full compliance with industry privacy standards.' },
];

function TrustSection() {
  return (
    <section id="trust" className="relative bg-[#0F172A] py-24 md:py-32">
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/20 to-transparent" />
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Why FixMyDay.ai</p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[#F8FAFC] sm:text-4xl">
            Built with Privacy &amp; Security First
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#94A3B8]">
            Every tool we build prioritizes your privacy, speed, and value.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="group text-center rounded-2xl border border-[#334155] bg-[#1E293B]/40 p-8 transition-all hover:border-[#F59E0B]/30 hover:bg-[#1E293B]/60"
            >
              <div className="mx-auto mb-5 inline-flex items-center justify-center rounded-xl bg-[#F59E0B]/10 p-3.5 text-[#F59E0B] transition-colors group-hover:bg-[#F59E0B]/20">
                <pillar.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-[#F8FAFC] mb-2">{pillar.title}</h3>
              <p className="text-[#94A3B8] leading-relaxed text-sm">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/20 to-transparent" />
    </section>
  );
}

/* ─── Contact Section ─── */
function ContactSection() {
  return (
    <section id="contact" className="relative overflow-hidden">
      <div className="relative bg-[#F8FAFC] pt-24 pb-20 md:pt-32 md:pb-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.3]"
          style={{ backgroundImage: 'radial-gradient(circle, #CBD5E1 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <img src="/FixMyDayIcon.png" alt="FixMyDay.ai" className="mx-auto mb-6 object-contain" width="160" height="160" />
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl md:text-5xl mb-4">
            Get in Touch
          </h2>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[#64748B] mb-10">
            Have questions about our tools or want to learn more? Reach out and we'll get back to you.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="mailto:fixmyday@use.startmail.com"
              className="group inline-flex items-center gap-2.5 rounded-lg bg-[#F59E0B] px-6 py-3.5 text-sm font-semibold text-[#0F172A] hover:bg-[#D97706] transition-all shadow-lg shadow-[#F59E0B]/25"
            >
              <Mail className="h-4 w-4" />
              fixmyday@use.startmail.com
            </a>
            <a
              href="tel:+13466916723"
              className="group inline-flex items-center gap-2.5 rounded-lg bg-[#F59E0B] px-6 py-3.5 text-sm font-semibold text-[#0F172A] hover:bg-[#D97706] transition-all shadow-lg shadow-[#F59E0B]/25"
            >
              <Phone className="h-4 w-4" />
              (346) 691-6723
            </a>
          </div>
        </div>
      </div>

      {/* Curved divider into footer */}
      <div className="relative -mt-px bg-[#F8FAFC]">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full h-auto" preserveAspectRatio="none">
          <path d="M0,0 C360,60 1080,60 1440,0 L1440,60 L0,60 Z" fill="#0B1120" />
        </svg>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function LandingFooter() {
  return (
    <footer className="bg-[#0B1120] py-10 -mt-px">
      <div className="mx-auto max-w-6xl px-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/FixMyDayIcon.png" alt="FixMyDay.ai" className="h-5 w-5 object-contain" />
          <span className="text-sm text-[#64748B]">&copy; 2026 FixMyDay.ai. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to={ROUTES.PRIVACY} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Privacy Policy</Link>
          <Link to={ROUTES.TERMS} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Terms &amp; Conditions</Link>
          <Link to={ROUTES.LEGAL} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Legal Info</Link>
          <Link to={ROUTES.CONTACT} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Contact</Link>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function Landing() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <ToolsGrid />
      <TrustSection />
      <ContactSection />
      <LandingFooter />
    </main>
  );
}
