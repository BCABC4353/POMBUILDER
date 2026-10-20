import { FolderOpen, FileText, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@ds/index.js';

interface ToolbarProps {
  checkedCount: number;
  outputDir: string | null;
  generating: boolean;
  onGenerate: () => void;
  onOpenOutput: () => void;
  onChooseOutput: () => void;
}

export function Toolbar({
  checkedCount,
  outputDir,
  generating,
  onGenerate,
  onOpenOutput,
  onChooseOutput,
}: ToolbarProps) {
  const canGenerate = checkedCount > 0 && outputDir !== null && !generating;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-glass-edge bg-surface-raised px-fluid-md py-2">
      <Button variant="primary" size="md" disabled={!canGenerate} onClick={onGenerate} aria-busy={generating || undefined}>
        {generating ? <Loader2 className="animate-spin" /> : <FileText />}
        {generating ? 'Generating...' : `Generate Print File${checkedCount > 0 ? ` (${checkedCount})` : ''}`}
      </Button>
      <Button variant="secondary" size="md" disabled={!outputDir} onClick={onOpenOutput}>
        <FolderOpen />
        Open Output Folder
      </Button>
      <Button variant="secondary" size="md" onClick={onChooseOutput} disabled={generating}>
        <FolderPlus />
        Change Output Folder
      </Button>
      {outputDir ? (
        <span className="min-w-0 flex-1 text-fluid-label text-content-muted [overflow-wrap:anywhere]" data-testid="output-dir">
          <span className="font-bold text-content-secondary">Output folder: </span>
          <span className="font-mono">{outputDir}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-fluid-label font-bold text-chip-amber-fg" data-testid="output-dir-hint">
          Choose an output folder to enable Generate
        </span>
      )}
    </div>
  );
}
