import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Pricing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Preserve query params (success/canceled from Stripe) as we redirect
    const params = searchParams.toString();
    const suffix = params ? `?${params}` : '';
    navigate(`/fixmynight${suffix}#pricing`, { replace: true });
  }, [navigate, searchParams]);

  return null;
}
