import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const ADMIN_PIN = '8808';
const ADMIN_STORAGE_KEY = 'gamers_admin_mode';

interface AdminContextType {
  isAdmin: boolean;
  login: (pin: string) => boolean;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    // Check localStorage on init
    return localStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    // Persist admin state
    localStorage.setItem(ADMIN_STORAGE_KEY, isAdmin ? 'true' : 'false');
  }, [isAdmin]);

  const login = (pin: string): boolean => {
    if (pin === ADMIN_PIN) {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAdmin(false);
  };

  return (
    <AdminContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminMode() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdminMode must be used within an AdminProvider');
  }
  return context;
}
