import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';
import {
  Menu, X, ArrowRight, Mail, Check, Star, Phone, Clock, Shield,
  Bot, Siren, Sunrise, MessageSquare, PhoneOff, Smartphone,
  Thermometer, Droplets, Zap, KeyRound, DoorOpen, Wrench, PanelTop,
  ShieldCheck, FileText, Scale,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/* ─── Navbar ─── */
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { href: '#features', label: 'Features' },
    { href: '#industries', label: 'Industries' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#sms-consent', label: 'SMS Consent' },
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
        <a href="#" className="flex items-center gap-2.5">
          <img src="/FixMyNightIcon.png" alt="FixMyNight" className="h-8 w-8 object-contain" />
          <span className={`font-semibold text-lg tracking-tight transition-colors duration-300 ${scrolled ? 'text-[#F8FAFC]' : 'text-[#0F172A]'}`}>
            FixMyNight
          </span>
          <span className={`hidden sm:inline text-sm font-normal ml-0.5 transition-colors duration-300 ${scrolled ? 'text-[#64748B]' : 'text-[#94A3B8]'}`}>
            by FixMyDay.ai
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors duration-300 ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#cta"
            className="inline-flex items-center justify-center rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#D97706] transition-colors"
          >
            Get Started
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
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${scrolled ? 'text-[#94A3B8] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#0F172A]'}`}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#cta"
            className="inline-flex items-center justify-center rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#D97706] transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            Get Started
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
      {/* Top: White section with logo */}
      <div className="relative bg-white pt-32 pb-28 md:pt-44 md:pb-36">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{ backgroundImage: 'radial-gradient(circle, #CBD5E1 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-8 flex flex-col items-center gap-6">
            <img
              src="/FixMyNightLogo.png"
              alt="FixMyNight — Smart Answers, Peaceful Nights"
              className="h-auto w-[280px] sm:w-[340px] md:w-[400px] object-contain"
            />
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08]">
            Never Miss a{' '}
            <span className="bg-gradient-to-r from-[#F59E0B] to-[#D97706] bg-clip-text text-transparent">Call Again</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#64748B] md:text-xl">
            Your voicemail costs you customers. Half the people who hit voicemail hang up and call your competitor. Sarah answers every call, gets their info, and texts you immediately.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="#cta"
              className="group inline-flex items-center gap-2 rounded-lg bg-[#F59E0B] px-6 py-3.5 text-sm font-semibold text-[#0F172A] hover:bg-[#D97706] transition-all shadow-lg shadow-[#F59E0B]/25"
            >
              Get Started
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#features"
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
      <div className="relative bg-[#0F172A] pb-16 md:pb-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-8 sm:grid-cols-3 text-center">
            {[
              { value: '24/7', label: 'Every Call Answered' },
              { value: '<2s', label: 'Average Answer Time' },
              { value: '100%', label: 'Calls Captured' },
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

/* ─── Features ─── */
const features = [
  { icon: PhoneOff, title: 'AI Answers Every Missed Call', description: 'Day or night, when you can\u2019t pick up, Sarah does. She takes messages during business hours and runs the full AI assistant after hours \u2014 no more lost leads to voicemail.' },
  { icon: Smartphone, title: 'Instant SMS Notifications', description: 'Get a text the moment a call comes in with the caller\u2019s name, number, and what they need. No waiting until morning to find out you missed a job.' },
  { icon: Siren, title: 'Emergency Detection & Dispatch', description: 'After hours, Sarah identifies real emergencies, collects caller info, and transfers directly to your on-call technician. No delays, no missed emergencies.' },
  { icon: MessageSquare, title: 'On-Call Management via Text', description: 'Technicians manage their on-call status with simple text commands: ON, OFF, STATUS. No app downloads, no logins required.' },
  { icon: Sunrise, title: 'Morning Summary Email', description: 'Every morning, get a clean summary of all overnight calls \u2014 emergencies handled, callbacks needed, messages received \u2014 delivered straight to your inbox.' },
  { icon: Bot, title: 'Client Portal & Call Recordings', description: 'Full call history, recordings, and analytics in your client portal. See exactly what Sarah said and what your callers needed.' },
];

function Features() {
  return (
    <section id="features" className="relative bg-[#F8FAFC] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Features</p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
            Set up call forwarding once. We handle the rest.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#64748B]">
            Messages during the day, full AI assistant at night. Works with any phone system.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-[#E2E8F0] bg-white p-8 transition-all hover:border-[#F59E0B]/40 hover:shadow-lg hover:shadow-[#F59E0B]/5"
            >
              <div className="mb-5 inline-flex items-center justify-center rounded-xl bg-[#0F172A] p-3 text-[#F59E0B] transition-colors group-hover:bg-[#F59E0B] group-hover:text-[#0F172A]">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-[#0F172A] mb-2">{feature.title}</h3>
              <p className="text-[#64748B] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Industries ─── */
const industries = [
  { label: 'HVAC', icon: Thermometer },
  { label: 'Plumbing', icon: Droplets },
  { label: 'Electrical', icon: Zap },
  { label: 'Locksmith', icon: KeyRound },
  { label: 'Garage Door', icon: DoorOpen },
  { label: 'Glass & Window', icon: PanelTop },
  { label: 'General Contractor', icon: Wrench },
];

function Industries() {
  return (
    <section id="industries" className="relative bg-[#0F172A] py-24 md:py-32">
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/20 to-transparent" />
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Industries</p>
        <h2 className="text-balance text-3xl font-bold tracking-tight text-[#F8FAFC] sm:text-4xl mb-4">
          Built for Service Contractors
        </h2>
        <p className="mx-auto max-w-xl text-[#94A3B8] text-lg leading-relaxed mb-12">
          FixMyNight is purpose-built for the trades that keep homes and businesses running.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {industries.map((ind) => (
            <div
              key={ind.label}
              className="group inline-flex items-center gap-2.5 rounded-full border border-[#334155] bg-[#1E293B]/60 px-5 py-2.5 text-sm font-medium text-[#CBD5E1] transition-all hover:border-[#F59E0B]/50 hover:bg-[#F59E0B]/10 hover:text-[#F59E0B]"
            >
              <ind.icon className="h-4 w-4 text-[#64748B] transition-colors group-hover:text-[#F59E0B]" />
              {ind.label}
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/20 to-transparent" />
    </section>
  );
}

/* ─── Pricing ─── */
const tiers = [
  {
    name: 'Starter',
    price: 99,
    priceId: 'price_1TB2n0F4SIXUt9GkOxh9DN64',
    calls: 50,
    description: 'Perfect for solo operators and small shops',
    features: [
      'AI answers every missed call',
      '50 calls per month included',
      'Daytime message-taking',
      'After-hours AI assistant',
      'Emergency tech dispatch',
      'Instant SMS notifications',
      'Morning summary email',
      'Client portal access',
    ],
    popular: false,
  },
  {
    name: 'Standard',
    price: 179,
    priceId: 'price_1TB2lRF4SIXUt9GkYaN8EJBh',
    calls: 100,
    description: 'Best value for growing businesses',
    features: [
      'Everything in Starter, plus:',
      '100 calls per month included',
      'Call recordings',
      'Multi-technician support',
      'SMS on-call management',
    ],
    popular: true,
  },
  {
    name: 'Pro',
    price: 399,
    priceId: 'price_1TB2kDF4SIXUt9Gk1oFeL5PA',
    calls: 250,
    description: 'For multi-crew operations',
    features: [
      'Everything in Standard, plus:',
      '250 calls per month included',
      'Dedicated onboarding support',
    ],
    popular: false,
  },
];

function PricingSection() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const checkoutStatus = new URLSearchParams(window.location.search).get('checkout');

  useEffect(() => {
    if (checkoutStatus) {
      // Scroll to pricing section after Stripe redirect
      setTimeout(() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [checkoutStatus]);

  const handleCheckout = async (priceId: string, tierName: string) => {
    setLoadingTier(tierName);
    try {
      const res = await fetch(`${API_BASE}/api/v1/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // fall through
    }
    setLoadingTier(null);
  };

  return (
    <section id="pricing" className="relative bg-[#F8FAFC] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold tracking-wide text-[#F59E0B] uppercase mb-3">Pricing</p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#64748B]">
            Traditional answering services charge <span className="text-[#0F172A] font-semibold">$400–600/month</span> for a human
            who reads from a script. FixMyNight's AI answers every call — day and night — for a fraction of the cost.
          </p>
          <p className="mt-2 text-sm text-[#94A3B8]">
            All plans include daytime message-taking + after-hours AI assistant
          </p>
        </div>

        {checkoutStatus === 'success' && (
          <div className="mb-8 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-700 font-medium">Welcome aboard! Your subscription is active. Check your email — we'll send setup instructions within the next few hours to get your AI phone assistant up and running.</p>
          </div>
        )}
        {checkoutStatus === 'canceled' && (
          <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-[#D97706]">Checkout was canceled. No worries — pick a plan when you're ready.</p>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 items-start mb-16">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-8 flex flex-col transition-all duration-300 ease-out hover:-translate-y-2 ${
                tier.popular
                  ? 'bg-white border-[#F59E0B] ring-1 ring-[#F59E0B] shadow-lg shadow-[#F59E0B]/10 md:scale-105 hover:shadow-2xl hover:shadow-[#F59E0B]/15'
                  : 'bg-white border-[#E2E8F0] shadow-sm hover:shadow-xl hover:border-[#CBD5E1]'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 bg-[#F59E0B] text-[#0F172A] text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-[#F59E0B]/25">
                    <Star className="w-3.5 h-3.5" fill="currentColor" />
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-[#0F172A]">{tier.name}</h3>
                <p className="text-sm text-[#64748B] mt-1">{tier.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[#0F172A]">${tier.price}</span>
                  <span className="text-[#94A3B8]">/month</span>
                </div>
                <p className="text-sm text-[#64748B] mt-1">{tier.calls} calls included &middot; $1.50/extra</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    {i === 0 && tier.name !== 'Starter' ? (
                      <Zap className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                    ) : (
                      <Check className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                    )}
                    <span className="text-sm text-[#334155]">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(tier.priceId, tier.name)}
                disabled={loadingTier !== null}
                className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                  tier.popular
                    ? 'bg-[#F59E0B] text-[#0F172A] hover:bg-[#D97706] shadow-lg shadow-[#F59E0B]/25'
                    : 'bg-[#0F172A] text-white hover:bg-[#1E293B] border border-[#0F172A]'
                } disabled:opacity-50`}
              >
                {loadingTier === tier.name ? 'Redirecting...' : 'Get Started'}
              </button>
            </div>
          ))}
        </div>

        {/* Comparison callout */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 md:p-12 shadow-sm">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-2xl font-bold text-[#0F172A] mb-3">Why replace your voicemail?</h3>
              <p className="text-[#64748B]">
                Half the people who hit voicemail hang up and call your competitor.
                FixMyNight answers every call, gets their info, and texts you immediately —
                during the day and after hours. No more lost leads, no more missed emergencies.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#0F172A] rounded-xl p-4 text-center">
                <Clock className="w-6 h-6 text-[#F59E0B] mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">24/7</p>
                <p className="text-xs text-[#94A3B8] mt-1">Always answering</p>
              </div>
              <div className="bg-[#0F172A] rounded-xl p-4 text-center">
                <Zap className="w-6 h-6 text-[#F59E0B] mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">&lt;2s</p>
                <p className="text-xs text-[#94A3B8] mt-1">Answer time</p>
              </div>
              <div className="bg-[#0F172A] rounded-xl p-4 text-center">
                <Shield className="w-6 h-6 text-[#F59E0B] mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">100%</p>
                <p className="text-xs text-[#94A3B8] mt-1">Calls captured</p>
              </div>
              <div className="bg-[#0F172A] rounded-xl p-4 text-center">
                <Phone className="w-6 h-6 text-[#F59E0B] mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">Live</p>
                <p className="text-xs text-[#94A3B8] mt-1">Tech dispatch</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── SMS Consent (A2P compliant — do not modify text) ─── */
function SmsConsent() {
  return (
    <section id="sms-consent" className="relative bg-[#F8FAFC] py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center mb-10">
          <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-[#0F172A] p-3 text-[#F59E0B]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
            SMS Consent &amp; Communications
          </h2>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 md:p-10 shadow-sm">
          <p className="text-[#334155] leading-relaxed mb-4">
            When a business subscribes to FixMyNight and adds technicians to the system,
            each technician receives a verification SMS. By texting{' '}
            <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-sm font-mono font-semibold text-[#0F172A]">ON</code>,
            technicians consent to receive on-call alerts, emergency dispatch notifications,
            and shift reminders.
          </p>
          <p className="text-[#334155] leading-relaxed mb-4">
            Business owners consent to receive fallback alerts and morning summaries during account setup.
          </p>
          <p className="text-[#334155] leading-relaxed mb-6">
            Message frequency varies. Message and data rates may apply. Text{' '}
            <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-sm font-mono font-semibold text-[#0F172A]">STOP</code>{' '}
            to opt out at any time. Text{' '}
            <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-sm font-mono font-semibold text-[#0F172A]">HELP</code>{' '}
            for assistance. For support, contact{' '}
            <a
              href="mailto:fixmyday@use.startmail.com"
              className="font-medium text-[#F59E0B] underline underline-offset-2 hover:text-[#D97706] transition-colors"
            >
              fixmyday@use.startmail.com
            </a>.
          </p>

          <div className="flex flex-wrap gap-4 border-t border-[#E2E8F0] pt-6">
            <Link
              to={ROUTES.PRIVACY}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A] hover:text-[#F59E0B] transition-colors"
            >
              <FileText className="h-4 w-4" />
              Privacy Policy
            </Link>
            <Link
              to={ROUTES.TERMS}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A] hover:text-[#F59E0B] transition-colors"
            >
              <Scale className="h-4 w-4" />
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function Cta() {
  return (
    <section id="cta" className="relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/20 to-transparent z-10" />

      <div className="relative bg-[#F8FAFC] pt-24 pb-20 md:pt-32 md:pb-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.3]"
          style={{ backgroundImage: 'radial-gradient(circle, #CBD5E1 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <img src="/FixMyNightIcon.png" alt="FixMyNight" className="mx-auto mb-6 h-14 w-14 object-contain" />
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl md:text-5xl mb-4">
            Ready to get started?
          </h2>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[#64748B] mb-10">
            Contact us to set up FixMyNight for your business.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              to={ROUTES.CONTACT}
              className="group inline-flex items-center gap-2 rounded-lg bg-[#F59E0B] px-6 py-3.5 text-sm font-semibold text-[#0F172A] hover:bg-[#D97706] transition-all shadow-lg shadow-[#F59E0B]/25"
            >
              <Mail className="h-4 w-4" />
              Contact Us
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to={ROUTES.PORTAL_ENTRY}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-6 py-3.5 text-sm font-medium text-[#0F172A] hover:border-[#CBD5E1] hover:bg-white transition-all"
            >
              Client Portal
            </Link>
            <Link
              to={ROUTES.ADMIN_LOGIN}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-6 py-3.5 text-sm font-medium text-[#0F172A] hover:border-[#CBD5E1] hover:bg-white transition-all"
            >
              Administrator Login
            </Link>
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
function ProductFooter() {
  return (
    <footer className="bg-[#0B1120] py-10">
      <div className="mx-auto max-w-6xl px-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/FixMyNightIcon.png" alt="FixMyNight" className="h-5 w-5 object-contain" />
          <span className="text-sm text-[#64748B]">FixMyNight by FixMyDay.ai</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to={ROUTES.PRIVACY} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Privacy</Link>
          <Link to={ROUTES.TERMS} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Terms</Link>
          <Link to={ROUTES.LEGAL} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Legal</Link>
          <Link to={ROUTES.CONTACT} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Support</Link>
          <Link to={ROUTES.PORTAL_ENTRY} className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors">Client Portal</Link>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function FixMyNightProduct() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <Industries />
      <PricingSection />
      <SmsConsent />
      <Cta />
      <ProductFooter />
    </main>
  );
}
