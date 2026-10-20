import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const isArbitraryClampFontSize = (value) => /^\[clamp\(.+\)\]$/.test(value);

const customTwMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        'fluid-xs',
        'fluid-sm',
        'fluid-md',
        'fluid-lg',
        'fluid-xl',
        'fluid-ctl-05',
        'fluid-ctl-1',
        'fluid-ctl-15',
        'fluid-ctl-2',
        'fluid-ctl-25',
        'fluid-ctl-3',
        'fluid-ctl-4',
      ],
    },
    classGroups: {
      'font-size': [
        {
          text: [
            'fluid-micro',
            'fluid-label',
            'fluid-nano',
            'fluid-nano-narrow',
            'fluid-body',
            'fluid-sm',
            'fluid-sm-narrow',
            'fluid-heading',
            'fluid-section',
            'fluid-title',
            'fluid-hero',
            'fluid-hero-report',
            'fluid-billed',
            'fluid-billed-report',
            'fluid-verdict',
            'fluid-verdict-report',
            'data-nano',
            'data-xs',
            'data-sm',
            'data-base',
            isArbitraryClampFontSize,
          ],
        },
      ],
    },
  },
});

export const cn = (...args) => customTwMerge(clsx(args));
