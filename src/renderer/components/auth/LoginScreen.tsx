import { Button } from '@ds/Button.jsx';
import { Card } from '@ds/Card.jsx';
import { GlassPanel } from '@ds/GlassPanel.jsx';
import { PanelTitle } from '@ds/PanelTitle.jsx';
import { LOGO_SRC } from '../../lib/logo';

interface LoginScreenProps {
  isLoading?: boolean;
  error?: string | null;
  onLogin: () => void;
}

export function LoginScreen({ isLoading, error, onLogin }: LoginScreenProps) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-surface p-6">
      <GlassPanel padding="none" gap="none" className="w-full max-w-sm gap-fluid-md p-fluid-lg">
        <div className="flex flex-col items-center gap-3 pt-1">
          <img src={LOGO_SRC} alt="" className="h-10 w-auto" />
          <PanelTitle>POM Builder</PanelTitle>
          <p className="text-center text-fluid-body text-content-secondary">
            Sign in with your Microsoft account to continue.
          </p>
        </div>
        {error && (
          <Card tone="warning" padding="md">
            <p className="text-center text-fluid-label font-semibold text-chip-amber-fg">{error}</p>
          </Card>
        )}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isLoading}
          onClick={onLogin}
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </GlassPanel>
    </div>
  );
}
