import { FolderOpen, FileText, FolderPlus } from 'lucide-react';
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
    <div className="flex shrink-0 items-center gap-2 border-b border-glass-edge bg-surface-raised px-fluid-md py-2">
      <Button
        variant="primary"
        size="md"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        <FileText />
        Generate print file
        {checkedCount > 0 ? ` (${checkedCount})` : ''}
      </Button>
      <Button
        variant="secondary"
        size="md"
        disabled={!outputDir}
        onClick={onOpenOutput}
      >
        <FolderOpen />
        Open output folder
      </Button>
      <Button variant="secondary" size="md" onClick={onChooseOutput}>
        <FolderPlus />
        Change output folder
      </Button>
    </div>
  );
}
