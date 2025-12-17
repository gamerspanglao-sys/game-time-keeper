import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminMode } from '@/hooks/useAdminMode';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin } = useAdminMode();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
}
