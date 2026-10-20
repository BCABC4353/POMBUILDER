import designSystem from './design_system/tailwind.config.js';

export default {
  presets: [designSystem],
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,jsx,ts,tsx}',
    './design_system/ds/**/*.{js,jsx}',
  ],
};
