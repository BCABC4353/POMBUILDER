export const IPC_CHANNELS = {
  auth: {
    login: 'auth:login',
    logout: 'auth:logout',
    getUser: 'auth:get-user',
    getToken: 'auth:get-token',
    isAuthenticated: 'auth:is-authenticated',
    validateToken: 'auth:validate-token',
    switchAccount: 'auth:switch-account',
  },
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    isMaximized: 'window:is-maximized',
    setTitleBarOverlay: 'window:set-title-bar-overlay',
  },
  app: {
    getVersion: 'app:get-version',
  },
  update: {
    state: 'update:state',
    install: 'update:install',
  },
} as const;

type ChannelValues<T> = T extends string ? T : T extends object ? ChannelValues<T[keyof T]> : never;
export type IpcChannel = ChannelValues<typeof IPC_CHANNELS>;
