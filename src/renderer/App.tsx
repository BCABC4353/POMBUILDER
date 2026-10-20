import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ForceUpdateModal } from './components/ForceUpdateModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { Toolbar } from './components/Toolbar';
import { BlockedBanner } from './components/BlockedBanner';
import { ClaimsTable } from './components/ClaimsTable';
import { DetailPane } from './components/DetailPane';
import { AlertTriangle, X } from 'lucide-react';
import { Button, TableSkeleton } from '@ds/index.js';
import { useAuthStore } from './stores/auth-store';
import { useClaimsStore } from './stores/claims-store';
import { useTheme } from './lib/theme';
import { useTitleBarOverlay } from './lib/titlebar';
import type { ForceUpdateState } from '@shared/types';

const SKELETON_WIDTHS = ['36px', '80px', '90px', '160px', '90px', '50px', '220px', '200px'];

const INACTIVE_UPDATE: ForceUpdateState = {
  active: false,
  secondsLeft: 30,
  holding: false,
};

function ClaimsView({ version }: { version: string }) {
  const {
    rows,
    checkedIds,
    selectedTripId,
    loading,
    error,
    lastRefresh,
    refreshing,
    progressText,
    outputDir,
    load,
    refresh,
    generate,
    toggleCheck,
    selectRow,
    chooseOutputDir,
    loadSettings,
    dismissError,
  } = useClaimsStore();

  const { user } = useAuthStore();

  useEffect(() => {
    void loadSettings();
    void load();
    const unsub = window.electronAPI.claims.onProgress((text) => {
      useClaimsStore.setState({ progressText: text });
    });
    return unsub;
  }, [load, loadSettings]);

  const selectedRow = selectedTripId !== null
    ? (rows.find((r) => r.TripID === selectedTripId) ?? null)
    : null;

  const total = rows.length;
  const mailable = rows.filter((r) => r.checkable).length;
  const blocked = rows.filter((r) => !r.checkable).length;

  const openOutput = () => {
    if (outputDir) void window.electronAPI.app.openOutput(outputDir);
  };

  const header = (
    <Header
      version={version}
      upn={user?.email}
      refreshing={refreshing}
      progressText={progressText}
      onRefresh={() => void refresh()}
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col p-fluid-sm">
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-surface-base">
              <TableSkeleton matrixCount={0} preambleWidths={SKELETON_WIDTHS} aria-label="Loading claims" />
            </div>
          </div>
          <DetailPane row={null} />
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-fluid-sm border-b border-chip-amber-bd bg-chip-amber-bg px-fluid-md py-2 text-fluid-body text-chip-amber-fg"
        >
          <AlertTriangle className="size-[1em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-bold" title={error}>
            {error}
          </span>
          <Button variant="ghost" size="sm" onClick={dismissError} aria-label="Dismiss message" title="Dismiss">
            <X />
          </Button>
        </div>
      )}
      <BlockedBanner rows={rows} />
      <Toolbar
        checkedCount={checkedIds.size}
        outputDir={outputDir}
        generating={false}
        onGenerate={() => void generate()}
        onOpenOutput={openOutput}
        onChooseOutput={() => void chooseOutputDir()}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col p-fluid-sm">
          <ClaimsTable
            rows={rows}
            checkedIds={checkedIds}
            selectedTripId={selectedTripId}
            onToggleCheck={toggleCheck}
            onSelectRow={selectRow}
          />
        </div>
        <DetailPane row={selectedRow} />
      </div>
      <Footer
        lastRefresh={lastRefresh}
        version={version}
        total={total}
        mailable={mailable}
        blocked={blocked}
      />
    </>
  );
}

export function App() {
  const { isAuthenticated, isLoading, error, login, checkAuth } = useAuthStore();
  const [updateState, setUpdateState] = useState<ForceUpdateState>(INACTIVE_UPDATE);
  const [version, setVersion] = useState('');
  const { theme } = useTheme();
  useTitleBarOverlay(null, isLoading || !isAuthenticated ? `${theme}:${isLoading ? 'loading' : 'login'}` : null);

  useEffect(() => {
    void checkAuth();
    void window.electronAPI.app.getVersion().then(setVersion);
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
      <ClaimsView version={version} />
      <ForceUpdateModal state={updateState} onRestart={() => window.electronAPI.update.install()} />
    </div>
  );
}
