import type {
  RuntimeInfo,
  UpdateCheckResult,
  UpdateApplyStartResult,
  UpdateApplyStatus,
} from './types';

declare global {
  interface Window {
    stradlDesktop?: {
      getRuntimeInfo: () => Promise<RuntimeInfo>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      applyUpdate: () => Promise<UpdateApplyStartResult>;
      getUpdateStatus: () => Promise<UpdateApplyStatus>;
      onUpdateStatus?: (listener: (status: UpdateApplyStatus) => void) => (() => void);
    };
  }
}

export {};
