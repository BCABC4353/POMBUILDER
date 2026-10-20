import { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ForceUpdateModal } from './components/ForceUpdateModal';
import type { ForceUpdateState } from '@shared/types';

const INACTIVE_UPDATE: ForceUpdateState = {
  active: false,
  secondsLeft: 30,
  holding: false,
};

export function App() {
  const [updateState] = useState<ForceUpdateState>(INACTIVE_UPDATE);

  return (
    <div className="flex h-full flex-col bg-surface-deep">
      <Header version="1.0.0" />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center text-content-muted">
        <span className="text-fluid-body">Loading claims&hellip;</span>
      </main>
      <Footer version="1.0.0" />
      <ForceUpdateModal state={updateState} onRestart={() => {}} />
    </div>
  );
}
