import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ForceUpdateModal } from './components/ForceUpdateModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { Toolbar } from './components/Toolbar';
import { BlockedBanner } from './components/BlockedBanner';
import { ClaimsTable } from './components/ClaimsTable';
import { DetailPane } from './components/DetailPane';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
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
    generating,
    notice,
    load,
    refresh,
    generate,
    toggleCheck,
    selectRow,
    chooseOutputDir,
    loadSettings,
    dismissError,
    dismissNotice,
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
      upn={user?.email}
      refreshing={refreshing}
      refreshDisabled={generating}
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
          data-testid="error-banner"
          className="flex shrink-0 items-center gap-fluid-sm border-b border-chip-red-bd bg-chip-red-bg px-fluid-md py-2 text-fluid-body text-status-danger"
        >
          <AlertTriangle className="size-[1em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]">{error}</span>
          <Button variant="ghost" size="sm" onClick={dismissError} aria-label="Dismiss message" title="Dismiss">
            <X />
          </Button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          data-testid="notice-banner"
          className="flex shrink-0 items-center gap-fluid-sm border-b border-chip-emerald-bd bg-chip-emerald-bg px-fluid-md py-2 text-fluid-body text-chip-emerald-fg"
        >
          <CheckCircle2 className="size-[1em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]">{notice}</span>
          <Button variant="ghost" size="sm" onClick={dismissNotice} aria-label="Dismiss message" title="Dismiss">
            <X />
          </Button>
        </div>
      )}
      {refreshing && (
        <div
          role="status"
          data-testid="refresh-progress"
          className="flex shrink-0 items-center gap-fluid-sm border-b border-glass-edge bg-surface-raised px-fluid-md py-1.5 text-fluid-label font-bold text-content-secondary"
        >
          <Loader2 className="size-[1em] shrink-0 animate-spin" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{progressText || 'Refreshing from RescueNet (usually under a minute)...'}</span>
        </div>
      )}
      <BlockedBanner rows={rows} disabled={refreshing} />
      <Toolbar
        checkedCount={checkedIds.size}
        outputDir={outputDir}
        generating={generating}
        refreshing={refreshing}
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
            locked={refreshing}
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
