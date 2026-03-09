import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../../routes';
import { Check, Phone, Clock, Shield, Zap, Star } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const tiers = [
  {
    name: 'Starter',
    price: 89,
    priceId: 'price_1T8vmdF4SIXUt9Gk4fwXzQZH',
    calls: 40,
    description: 'Perfect for solo operators and small shops',
    features: [
      'AI voice agent answers 24/7',
      '40 calls per month included',
      'Emergency tech dispatch',
      'Morning call summary email',
      'SMS on-call management',
      'Client portal access',
    ],
    popular: false,
  },
  {
    name: 'Standard',
    price: 169,
    priceId: 'price_1T8vnEF4SIXUt9Gk1AmWw7X0',
    calls: 100,
    description: 'Best value for growing businesses',
    features: [
      'Everything in Starter, plus:',
      '100 calls per month included',
      'Priority emergency routing',
      'Call recording & transcripts',
      'Detailed analytics dashboard',
      'Multi-technician scheduling',
    ],
    popular: true,
  },
  {
    name: 'Pro',
    price: 299,
    priceId: 'price_1T8vnnF4SIXUt9GkUAZEokFf',
    calls: 250,
    description: 'For multi-crew operations',
    features: [
      'Everything in Standard, plus:',
      '250 calls per month included',
      'Custom AI agent personality',
      'Advanced call routing rules',
      'API access & integrations',
      'Dedicated onboarding support',
    ],
    popular: false,
  },
];

export default function Pricing() {
  const [searchParams] = useSearchParams();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const success = searchParams.get('success') === 'true';
  const canceled = searchParams.get('canceled') === 'true';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      }
    } catch {
      setLoadingTier(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0F172A]/95 backdrop-blur-md shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to={ROUTES.FIXMYNIGHT_PRODUCT} className="flex items-center gap-2">
            <img src="/FixMyNightLogo.png" alt="FixMyNight" className="h-8 object-contain" />
          </Link>
          <div className="flex items-center gap-4">
            <Link to={ROUTES.FIXMYNIGHT_PRODUCT} className="text-sm text-[#94A3B8] hover:text-white transition-colors">Product</Link>
            <Link to={ROUTES.PORTAL_ENTRY} className="text-sm text-[#94A3B8] hover:text-white transition-colors">Client Portal</Link>
            <Link to={ROUTES.ADMIN_LOGIN} className="text-sm text-[#94A3B8] hover:text-white transition-colors">Admin</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-32 pb-16 px-6 text-center">
        <div className="inline-flex items-center gap-2 bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-full px-4 py-1.5 mb-6">
          <Phone className="w-4 h-4 text-[#F59E0B]" />
          <span className="text-sm font-medium text-[#F59E0B]">Stop losing after-hours calls</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-[#94A3B8] max-w-2xl mx-auto mb-4">
          Traditional answering services charge <span className="text-white font-semibold">$400–600/month</span> for a human
          who reads from a script. FixMyNight's AI agent is smarter, faster, and a fraction of the cost.
        </p>
        <p className="text-sm text-[#64748B]">No contracts. Cancel anytime. 14-day free trial on all plans.</p>
      </div>

      {/* Success / Canceled banners */}
      {success && (
        <div className="max-w-3xl mx-auto px-6 mb-8">
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
            <p className="text-green-400 font-medium">Welcome aboard! Your subscription is active. We'll be in touch to get you set up.</p>
          </div>
        </div>
      )}
      {canceled && (
        <div className="max-w-3xl mx-auto px-6 mb-8">
          <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl p-4 text-center">
            <p className="text-[#F59E0B]">Checkout was canceled. No worries — pick a plan when you're ready.</p>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-8 flex flex-col ${
                tier.popular
                  ? 'bg-[#1E293B] border-[#F59E0B] shadow-xl shadow-[#F59E0B]/10 scale-[1.02] md:scale-105'
                  : 'bg-[#1E293B]/60 border-[#334155]'
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
                <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
                <p className="text-sm text-[#94A3B8] mt-1">{tier.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">${tier.price}</span>
                  <span className="text-[#64748B]">/month</span>
                </div>
                <p className="text-sm text-[#94A3B8] mt-1">{tier.calls} calls included</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    {i === 0 && tier.name !== 'Starter' ? (
                      <Zap className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                    ) : (
                      <Check className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                    )}
                    <span className="text-sm text-[#CBD5E1]">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(tier.priceId, tier.name)}
                disabled={loadingTier !== null}
                className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                  tier.popular
                    ? 'bg-[#F59E0B] text-[#0F172A] hover:bg-[#D97706] shadow-lg shadow-[#F59E0B]/25'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-[#334155]'
                } disabled:opacity-50`}
              >
                {loadingTier === tier.name ? 'Redirecting...' : 'Get Started'}
              </button>
            </div>
          ))}
        </div>

        {/* Comparison callout */}
        <div className="mt-16 rounded-2xl border border-[#1E293B] bg-[#1E293B]/40 p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl font-bold text-white mb-3">Why switch from a traditional answering service?</h2>
              <p className="text-[#94A3B8]">
                Most contractors pay $400–600/month for a human operator who reads from a script,
                can't dispatch techs, and sends you a voicemail at 7am. FixMyNight does it all —
                instantly, accurately, for a fraction of the cost.
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

        {/* FAQ-style bottom */}
        <div className="mt-12 text-center">
          <p className="text-[#64748B] text-sm">
            Questions? <Link to={ROUTES.CONTACT} className="text-[#F59E0B] hover:text-[#D97706]">Contact us</Link>
            {' '}&middot;{' '}
            <Link to={ROUTES.FIXMYNIGHT_PRODUCT} className="text-[#F59E0B] hover:text-[#D97706]">Learn more about FixMyNight</Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1E293B] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#64748B]">&copy; {new Date().getFullYear()} FixMyDay.ai</p>
          <div className="flex gap-4 text-xs text-[#64748B]">
            <Link to={ROUTES.PRIVACY} className="hover:text-[#94A3B8]">Privacy</Link>
            <Link to={ROUTES.TERMS} className="hover:text-[#94A3B8]">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
