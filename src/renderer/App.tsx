import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ForceUpdateModal } from './components/ForceUpdateModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { useAuthStore } from './stores/auth-store';
import type { ForceUpdateState } from '@shared/types';

const INACTIVE_UPDATE: ForceUpdateState = {
  active: false,
  secondsLeft: 30,
  holding: false,
};

export function App() {
  const { isAuthenticated, isLoading, error, user, checkAuth, login } = useAuthStore();
  const [updateState, setUpdateState] = useState<ForceUpdateState>(INACTIVE_UPDATE);

  useEffect(() => {
    void checkAuth();
    const unsub = window.electronAPI.update.onState(setUpdateState);
    return unsub;
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-surface-deep">
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center text-content-muted">
          <span className="text-fluid-body">Loading&hellip;</span>
        </main>
        <ForceUpdateModal state={updateState} onRestart={() => window.electronAPI.update.install()} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginScreen isLoading={isLoading} error={error} onLogin={() => void login()} />
        <ForceUpdateModal state={updateState} onRestart={() => window.electronAPI.update.install()} />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-deep">
      <Header version="1.0.0" upn={user?.email} />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center text-content-muted">
        <span className="text-fluid-body">Loading claims&hellip;</span>
      </main>
      <Footer version="1.0.0" />
      <ForceUpdateModal state={updateState} onRestart={() => window.electronAPI.update.install()} />
    </div>
  );
}
