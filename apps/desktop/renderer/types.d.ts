type ExposureMode = "local" | "lan";
type EngineStatus = "failed" | "ready" | "starting" | "stopped" | "stopping";

type EngineStatePayload = {
  detail?: string;
  key?: string;
  label?: string;
  phase?: string;
  status: EngineStatus;
};

type EngineExposurePayload = {
  advertisedUrls?: string[];
  companionUrls?: string[];
  exposureMode?: ExposureMode;
};

type EngineCompanionPayload = {
  certPath?: string;
  enabled?: boolean;
  error?: string;
  inviteCode?: string;
  inviteExpiresAt?: string;
  inviteRevoked?: boolean;
  inviteStatus?: string;
  urls?: string[];
};

type EngineClientPayload = {
  accessScope: "companion-guest" | "companion-host" | "raw";
  connectedAt: string;
  id: string;
  lastSeenAt: string;
  remoteAddress: string;
  role: string;
  sessionId: string | null;
  socketCount: number;
  userAgent: string;
};

type DockerDiagnosticPayload = {
  canStartDocker: boolean;
  code: string;
  detail: string;
  guidance: string;
  guideUrl: string;
  installUrl: string;
  platform: string;
  summary: string;
  title: string;
};

type EngineImageRecoveryPayload = {
  detail: string;
  engineImage: string;
  guidance: string;
  runtimeDir: string;
  runtimeKind: "libretro" | "native_linux";
  summary: string;
  title: string;
};

type LogController = {
  append: (message: string) => void;
  clear: () => void;
  sanitize: (message: string) => string;
};

type ExposureController = {
  getMode: () => ExposureMode;
  render: () => void;
  renderCompanionUrls: (urls?: string[]) => void;
  renderUrls: (urls?: string[]) => void;
  resetInviteCode: () => void;
  setCompanionStatus: (payload?: EngineCompanionPayload) => void;
  setEnabled: (enabled: boolean) => void;
};

type PhaseTracker = {
  render: (state?: EngineStatePayload) => void;
};

type ClientAccessController = {
  refresh: () => Promise<void>;
  resetActionPending: () => void;
  setControlsEnabled: (enabled: boolean) => void;
  startPolling: () => void;
  stopPolling: () => void;
};

type DockerRecoveryController = {
  setDockerRecoveryPending: (pending: boolean) => void;
  setDockerRecoveryVisible: (
    visible: boolean,
    diagnostic?: DockerDiagnosticPayload | null,
  ) => void;
  setImageBuildPending: (pending: boolean) => void;
  setImageRecoveryVisible: (
    visible: boolean,
    payload?: EngineImageRecoveryPayload | null,
  ) => void;
};

type ElectronApi = {
  createCompanionQrDataUrl: (url: string) => Promise<string>;
  launchWeb: () => Promise<void>;
  listEngineClients: () => Promise<{ clients: EngineClientPayload[] }>;
  openDockerResource: (
    resource: "guide" | "install",
    diagnosticCode: string,
  ) => Promise<void>;
  regenerateLanInvite: () => void;
  revokeEngineClient: (clientId: string) => Promise<{ disconnected: number }>;
  revokeLanInvite: () => void;
  rotateEngineToken: (options: { exposureMode?: ExposureMode }) => void;
  buildEngineImage: (options: { exposureMode?: ExposureMode }) => void;
  cancelDockerRecovery: () => void;
  startDocker: (options: { exposureMode?: ExposureMode }) => void;
  startDockerApplication: (options: { exposureMode?: ExposureMode }) => void;
  stopDocker: () => void;
  onServerLog: (callback: (event: unknown, message: string) => void) => void;
  onEngineState: (
    callback: (event: unknown, state: EngineStatePayload) => void,
  ) => void;
  onEngineStopped: (callback: (event: unknown) => void) => void;
  onEngineToken: (callback: (event: unknown, token: string) => void) => void;
  onEngineExposure: (
    callback: (event: unknown, payload: EngineExposurePayload) => void,
  ) => void;
  onEngineCompanion: (
    callback: (event: unknown, payload: EngineCompanionPayload) => void,
  ) => void;
  onDockerDiagnostic: (
    callback: (event: unknown, payload: DockerDiagnosticPayload) => void,
  ) => void;
  onDockerRecoveryStarted: (callback: (event: unknown) => void) => void;
  onDockerRecoveryReady: (callback: (event: unknown) => void) => void;
  onDockerRecoveryCancelled: (callback: (event: unknown) => void) => void;
  onEngineImageRecovery: (
    callback: (event: unknown, payload: EngineImageRecoveryPayload) => void,
  ) => void;
  onEngineImageBuildStarted: (callback: (event: unknown) => void) => void;
  onEngineImageBuildReady: (callback: (event: unknown) => void) => void;
};

type PixelatedWindow = Window &
  typeof globalThis & {
    electronAPI: ElectronApi;
    PixelatedExposure: {
      createExposureController: (elements: {
        companionCopy: HTMLElement;
        companionInviteActions: HTMLElement;
        companionInvite: HTMLElement;
        companionInviteCode: HTMLElement;
        companionInviteExpiry: HTMLElement;
        companionInviteStatus: HTMLElement;
        companionPanel: HTMLElement;
        companionQr: HTMLElement;
        companionQrImage: HTMLImageElement;
        companionQrPlaceholder: HTMLElement;
        companionQrStatus: HTMLElement;
        companionUrls: HTMLElement;
        createCompanionQrDataUrl: (url: string) => Promise<string>;
        exposureCopy: HTMLElement;
        exposureLabel: HTMLElement;
        lanToggle: HTMLInputElement;
        lanUrlPanel: HTMLElement;
        lanUrls: HTMLElement;
        lanWarning: HTMLElement;
      }) => ExposureController;
    };
    PixelatedLogs: {
      createLogController: (elements: { logBox: HTMLElement }) => LogController;
    };
    PixelatedModal: {
      bindDocsModal: (elements: {
        closeButton: HTMLElement;
        modal: HTMLElement;
        openButton: HTMLElement;
      }) => void;
    };
    PixelatedPhases: {
      createPhaseTracker: (elements: {
        phaseList: HTMLElement;
        phaseSummary: HTMLElement;
      }) => PhaseTracker;
    };
    PixelatedClients: {
      createClientAccessController: (elements: {
        clientsList: HTMLElement;
        clientsStatus: HTMLElement;
        getExposureMode: () => ExposureMode;
        getIsRunning: () => boolean;
        listEngineClients: () => Promise<{ clients: EngineClientPayload[] }>;
        revokeEngineClient: (
          clientId: string,
        ) => Promise<{ disconnected: number }>;
        rotateEngineToken: (options: { exposureMode?: ExposureMode }) => void;
        rotateTokenButton: HTMLButtonElement;
      }) => ClientAccessController;
    };
    PixelatedRecovery: {
      createDockerRecoveryController: (elements: {
        buildEngineImage: (options: { exposureMode?: ExposureMode }) => void;
        buildImageButton: HTMLButtonElement;
        cancelDockerRecovery: () => void;
        copyDiagnosticsButton: HTMLButtonElement;
        desktopPanels: HTMLElement;
        downloadButton: HTMLButtonElement;
        getExposureMode: () => ExposureMode;
        guideButton: HTMLButtonElement;
        guidance: HTMLElement;
        initializeEngine: () => void;
        logs: LogController;
        openDockerResource: (
          resource: "guide" | "install",
          diagnosticCode: string,
        ) => Promise<void>;
        panel: HTMLElement;
        retryButton: HTMLButtonElement;
        startButton: HTMLButtonElement;
        startDockerApplication: (options: {
          exposureMode?: ExposureMode;
        }) => void;
        startupPanel: HTMLElement;
        syncPanelHeights: () => void;
        title: HTMLElement;
      }) => DockerRecoveryController;
    };
  };

type StatusTone = "offline" | "ready" | "running";
