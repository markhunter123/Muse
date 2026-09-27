export const PROTOCOL_VERSION = 11 as const;
export const SCHEMA_VERSION = 16 as const;
export const APP_ID = "net.muse.app";
export const APP_NAME = "Muse";
export const APP_VERSION = "0.1.0";

export const APP_MENU_COMMANDS = [
  "newTask",
  "openProject",
  "openSettings",
  "openSearch",
  "openCommandPalette",
  "toggleSidebar",
  "openHelp",
  "openLogs",
  "checkForUpdates",
] as const;

export type AppMenuCommand = (typeof APP_MENU_COMMANDS)[number];

export const NATIVE_MENU_ACTIONS = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "selectAll",
  "reload",
  "zoomIn",
  "zoomOut",
  "resetZoom",
  "toggleFullScreen",
  "minimize",
  "toggleMaximize",
  "close",
  "restoreMainWindow",
  "toggleMainWindow",
] as const;

export type NativeMenuAction = (typeof NATIVE_MENU_ACTIONS)[number];

export const WINDOW_CONTROL_ACTIONS = [
  "getState",
  "minimize",
  "toggleMaximize",
  "close",
] as const;

export type WindowControlAction = (typeof WINDOW_CONTROL_ACTIONS)[number];

export const IPC = {
  invoke: {
    appGetVersion: "muse/app/getVersion",
    appOpenFeedback: "muse/app/openFeedback",
    appHealth: "muse/app/health",
    appGetOnboarding: "muse/app/getOnboarding",
    appDismissOnboarding: "muse/app/dismissOnboarding",
    /**
     * Quit the whole application through the ordered shutdown. Exposed for the
     * surfaces that own the window while the shell has no data yet — a stuck
     * startup must always be able to exit the app (issue #831).
     */
    appQuit: "muse/app/quit",
    /** Installed system font families, resolved by Electron main. */
    systemFontsList: "muse/app/systemFonts",
    updatesGetState: "muse/updates/getState",
    updatesCheck: "muse/updates/check",
    updatesDownload: "muse/updates/download",
    updatesInstall: "muse/updates/install",
    updatesOpenReleases: "muse/updates/openReleases",
    notificationList: "muse/notification/list",
    notificationMarkRead: "muse/notification/markRead",
    notificationMarkAllRead: "muse/notification/markAllRead",
    notificationClear: "muse/notification/clear",
    notificationShowNative: "muse/notification/showNative",
    notificationSetViewingSession: "muse/notification/setViewingSession",
    agentPrompt: "muse/agent/prompt",
    agentSteer: "muse/agent/steer",
    promptEnhance: "muse/prompt/enhance",
    speechTranscribe: "muse/speech/transcribe",
    speechSynthesize: "muse/speech/synthesize",
    speechGetStatus: "muse/speech/getStatus",
    voiceStart: "muse/voice/start",
    voiceStop: "muse/voice/stop",
    voiceCancel: "muse/voice/cancel",
    voiceGetState: "muse/voice/getState",
    voiceGetDevices: "muse/voice/getDevices",
    voiceGetModels: "muse/voice/getModels",
    voiceDownloadModel: "muse/voice/downloadModel",
    voiceDeleteModel: "muse/voice/deleteModel",
    voiceUpdateSettings: "muse/voice/updateSettings",
    voiceCheckPermission: "muse/voice/checkPermission",
    voiceRequestPermission: "muse/voice/requestPermission",
    /**
     * Credential writes only. There is deliberately no read channel: a stored
     * secret never travels back to the renderer, which is why the settings form
     * shows whether one is set rather than what it is.
     */
    voiceSetCredentials: "muse/voice/setCredentials",
    voiceClearCredentials: "muse/voice/clearCredentials",
    voiceCredentialStatus: "muse/voice/credentialStatus",
    agentCompact: "muse/agent/compact",
    agentAbort: "muse/agent/abort",
    agentStop: "muse/agent/stop",
    agentQueuePush: "muse/agent/queue/push",
    agentQueueList: "muse/agent/queue/list",
    agentQueueRemove: "muse/agent/queue/remove",
    agentQueuePrioritize: "muse/agent/queue/prioritize",
    agentQueueReorder: "muse/agent/queue/reorder",
    agentGetStatus: "muse/agent/getStatus",
    agentInstructionsGet: "muse/agent/instructions/get",
    agentInstructionsSave: "muse/agent/instructions/save",
    sessionList: "muse/session/list",
    sessionCreate: "muse/session/create",
    sessionFork: "muse/session/fork",
    sessionMoveProject: "muse/session/moveProject",
    sessionSearch: "muse/session/search",
    sessionSearchContext: "muse/session/searchContext",
    sessionGet: "muse/session/get",
    sessionCollaboration: "muse/session/collaboration",
    /** Validate and select a durable session from a reviewed host operation. */
    sessionOpen: "muse/session/open",
    sessionDelete: "muse/session/delete",
    sessionRename: "muse/session/rename",
    sessionSummarizeTitle: "muse/session/summarizeTitle",
    sessionConfigure: "muse/session/configure",
    sessionImportScan: "muse/session/importScan",
    sessionImportRun: "muse/session/importRun",
    modelConfigImportScan: "muse/modelConfig/importScan",
    modelConfigImportRun: "muse/modelConfig/importRun",
    sessionReplaceMessages: "muse/session/replaceMessages",
    sessionSaveRevision: "muse/session/saveRevision",
    sessionListRevisions: "muse/session/listRevisions",
    sessionActivateRevision: "muse/session/activateRevision",
    sessionGetScratchPath: "muse/session/getScratchPath",
    sessionOpenScratchPath: "muse/session/openScratchPath",
    projectOpenFolder: "muse/project/openFolder",
    settingsGet: "muse/settings/get",
    settingsSet: "muse/settings/set",
    configSyncGetState: "muse/configSync/getState",
    configSyncConfigure: "muse/configSync/configure",
    configSyncTest: "muse/configSync/test",
    configSyncSyncNow: "muse/configSync/syncNow",
    configSyncPause: "muse/configSync/pause",
    configSyncUnlock: "muse/configSync/unlock",
    configSyncApprove: "muse/configSync/approve",
    configSyncReject: "muse/configSync/reject",
    configSyncMapProject: "muse/configSync/mapProject",
    configSyncListHistory: "muse/configSync/listHistory",
    configSyncRestore: "muse/configSync/restore",
    configSyncChangePassword: "muse/configSync/changePassword",
    configSyncDisconnect: "muse/configSync/disconnect",
    networkProxyTest: "muse/network/testProxy",
    commandShellList: "muse/commandShell/list",
    secretsSet: "muse/secrets/set",
    secretsDelete: "muse/secrets/delete",
    secretsHas: "muse/secrets/has",
    projectOpen: "muse/project/open",
    projectPickFolders: "muse/project/pickFolders",
    projectMemoryGet: "muse/project/memory/get",
    projectMemorySave: "muse/project/memory/save",
    projectGroupList: "muse/project-group/list",
    projectGroupCreate: "muse/project-group/create",
    projectGroupRename: "muse/project-group/rename",
    projectGroupUpdate: "muse/project-group/update",
    projectGroupMemoryGet: "muse/project-group/memory/get",
    projectGroupMemorySave: "muse/project-group/memory/save",
    projectGroupInstructionsGet: "muse/project-group/instructions/get",
    projectGroupInstructionsSave: "muse/project-group/instructions/save",
    projectClone: "muse/project/clone",
    projectCloneCheckout: "muse/project/cloneCheckout",
    projectGet: "muse/project/get",
    projectList: "muse/project/list",
    projectSet: "muse/project/set",
    projectClear: "muse/project/clear",
    projectRemove: "muse/project/remove",
    pullsList: "muse/pulls/list",
    scheduledList: "muse/scheduled/list",
    scheduledCreate: "muse/scheduled/create",
    scheduledUpdate: "muse/scheduled/update",
    scheduledDelete: "muse/scheduled/delete",
    scheduledRun: "muse/scheduled/run",
    scheduledExecute: "muse/scheduled/execute",
    scheduledListRuns: "muse/scheduled/listRuns",
    toolResolvePermission: "muse/tool/resolvePermission",
    askToolResolve: "muse/agent/askTool/resolve",
    plansPending: "muse/plans/pending",
    plansResolve: "muse/plans/resolve",
    /**
     * List every paired remote `muse-host` this desktop knows, redacted so no
     * device token reaches the renderer. See ADR 0286 (R2b pairing UX).
     */
    remoteHostList: "muse/remoteHost/list",
    /**
     * Pair with a `muse-host` at `url` using a single-use `pairingToken`, mint
     * a device token, persist it encrypted, and open the live connection.
     */
    remoteHostPair: "muse/remoteHost/pair",
    /** Close the live connection for `hostKey` and drop its persisted record. */
    remoteHostRemove: "muse/remoteHost/remove",
    /**
     * Install and pair a `muse-host` on a machine the user reaches over SSH:
     * upload the bootstrap script, download and verify the published bundle
     * there, start the host, forward its loopback port, and exchange the
     * pairing token (spec §5.2). Uses the user's own SSH keys; no credential
     * crosses this channel.
     */
    remoteHostBootstrap: "muse/remoteHost/bootstrap",
    providersList: "muse/providers/list",
    providersReorder: "muse/providers/reorder",
    providersCreate: "muse/providers/create",
    providersUpdate: "muse/providers/update",
    providersDelete: "muse/providers/delete",
    /**
     * Set or clear one provider's API key. Separate from `providersUpdate`
     * because a plugin-declared row refuses a generic update while still
     * needing the credential its declaration asks for.
     */
    providersSetSecret: "muse/providers/setSecret",
    providersTest: "muse/providers/testConnection",
    providersListModels: "muse/providers/listModels",
    /**
     * Look one model id up in the local models.dev snapshot.
     *
     * `providersListModels` cannot answer this: it describes a saved or
     * reached provider's catalogue, and a hand-typed custom id exists nowhere
     * yet when the settings picker needs its published limits. This is a
     * snapshot read — no provider network access and no host call — so the
     * picker can seed a custom row without probing an endpoint that does not
     * know the id.
     */
    providersLookupModel: "muse/providers/lookupModel",
    providersRefreshModelCatalog: "muse/providers/refreshModelCatalog",
    providersModelCatalogStatus: "muse/providers/modelCatalogStatus",
    providersOauthVendors: "muse/providers/oauth/vendors",
    providersOauthStart: "muse/providers/oauth/start",
    providersOauthRespond: "muse/providers/oauth/respond",
    providersOauthCancel: "muse/providers/oauth/cancel",
    providersOauthDelete: "muse/providers/oauth/delete",
    pluginList: "muse/plugin/list",
    /** Plugin-contributed agent extensions (D387/D388, ADR 0214). */
    pluginImportExtension: "muse/plugin/importExtension",
    extensionsCommandRun: "muse/extensions/commands/run",
    extensionsUiRespond: "muse/extensions/ui/respond",
    pluginLoadDev: "muse/plugin/loadDev",
    /**
     * The answer to a development plugin's permission review. Loading a folder
     * is a two-step: `pluginLoadDev` returns the declaration, and this commits
     * the permissions the user accepted.
     */
    pluginLoadDevConfirm: "muse/plugin/loadDevConfirm",
    pluginReload: "muse/plugin/reload",
    /** Commits a reviewed widening for an already-loaded development plugin. */
    pluginReloadConfirm: "muse/plugin/reloadConfirm",
    pluginCreateFromTemplate: "muse/plugin/createFromTemplate",
    pluginInstallFromPath: "muse/plugin/installFromPath",
    pluginInstallFromPackage: "muse/plugin/installFromPackage",
    pluginEnable: "muse/plugin/enable",
    pluginDisable: "muse/plugin/disable",
    pluginSetScope: "muse/plugin/setScope",
    pluginUninstall: "muse/plugin/uninstall",
    pluginSetAutoUpdate: "muse/plugin/setAutoUpdate",
    pluginSettingsGet: "muse/plugin/settings/get",
    pluginSettingsSet: "muse/plugin/settings/set",
    pluginOpenPanel: "muse/plugin/openPanel",
    pluginLauncherToggle: "muse/pluginLauncher/toggle",
    pluginLauncherDismiss: "muse/pluginLauncher/dismiss",
    pluginThemes: "muse/plugin/themes",
    pluginScenicThemesDestinations: "muse/plugin/scenicThemes/destinations",
    pluginScenicThemesSetBlur: "muse/plugin/scenicThemes/setBlur",
    pluginServices: "muse/plugin/services",
    pluginViews: "muse/plugin/views",
    pluginViewOpen: "muse/plugin/view/open",
    pluginViewClose: "muse/plugin/view/close",
    pluginViewSetBounds: "muse/plugin/view/setBounds",
    pluginViewSetVisible: "muse/plugin/view/setVisible",
    mcpList: "muse/mcp/list",
    mcpUpsert: "muse/mcp/upsert",
    mcpRemove: "muse/mcp/remove",
    mcpSetEnabled: "muse/mcp/setEnabled",
    mcpSetScope: "muse/mcp/setScope",
    mcpTransfer: "muse/mcp/transfer",
    mcpTest: "muse/mcp/test",
    mcpOauthStart: "muse/mcp/oauth/start",
    mcpOauthCancel: "muse/mcp/oauth/cancel",
    mcpImport: "muse/mcp/import",
    mcpImportScan: "muse/mcp/importScan",
    mcpImportRun: "muse/mcp/importRun",
    mcpMarketSearch: "muse/mcp/market/search",
    skillList: "muse/skill/list",
    skillCreate: "muse/skill/create",
    skillImport: "muse/skill/import",
    skillImportScan: "muse/skill/importScan",
    skillImportRun: "muse/skill/importRun",
    skillMarketSearch: "muse/skill/market/search",
    skillMarketFetch: "muse/skill/market/fetch",
    skillUpdate: "muse/skill/update",
    skillRemove: "muse/skill/remove",
    skillSetEnabled: "muse/skill/setEnabled",
    skillSetScope: "muse/skill/setScope",
    skillTransfer: "muse/skill/transfer",
    skillRead: "muse/skill/read",
    skillReveal: "muse/skill/reveal",
    subagentList: "muse/subagent/list",
    subagentCatalog: "muse/subagent/catalog",
    subagentCreate: "muse/subagent/create",
    subagentUpdate: "muse/subagent/update",
    subagentRead: "muse/subagent/read",
    subagentRemove: "muse/subagent/remove",
    subagentSetEnabled: "muse/subagent/setEnabled",
    subagentSetScope: "muse/subagent/setScope",
    subagentSetBuiltinEnabled: "muse/subagent/setBuiltinEnabled",
    subagentReveal: "muse/subagent/reveal",
    marketRefresh: "muse/market/refresh",
    marketSearch: "muse/market/search",
    marketGetDetail: "muse/market/getDetail",
    marketInstall: "muse/market/install",
    marketCheckUpdates: "muse/market/checkUpdates",
    marketApplyUpdates: "muse/market/applyUpdates",
    marketCancelInstall: "muse/market/cancelInstall",
    commandPaletteSearch: "muse/commandPalette/search",
    commandPaletteExecute: "muse/commandPalette/execute",
    logOpenFolder: "muse/log/openFolder",
    devtoolsToggle: "muse/devtools/toggle",
    composerPickFiles: "muse/composer/pickFiles",
    composerPickPhotos: "muse/composer/pickPhotos",
    composerImportFiles: "muse/composer/importFiles",
    composerPasteFiles: "muse/composer/pasteFiles",
    clipboardRecordPaste: "muse/clipboard/recordPaste",
    composerCommands: "muse/composer/commands",
    workspaceDiff: "muse/workspace/diff",
    workspaceReviewRollback: "muse/workspace/review/rollback",
    browserNavigate: "muse/browser/navigate",
    browserAction: "muse/browser/action",
    browserSetBounds: "muse/browser/setBounds",
    browserSetVisible: "muse/browser/setVisible",
    browserOpenExternal: "muse/browser/openExternal",
    browserGetState: "muse/browser/getState",
    fsList: "muse/fs/list",
    fsRead: "muse/fs/read",
    fsReadImageDataUrl: "muse/fs/readImageDataUrl",
    statsGetTokenUsageHistory: "muse/stats/getTokenUsageHistory",
    fsReveal: "muse/fs/reveal",
    fsOpen: "muse/fs/open",
    fsIndex: "muse/fs/index",
    fsResolveRef: "muse/fs/resolveRef",
    windowSetWorkPanelReservation:
      "muse/window/setWorkPanelReservation",
    windowSetWorkPanelChatWidth: "muse/window/setWorkPanelChatWidth",
    windowSetBackgroundColor: "muse/window/setBackgroundColor",
    windowControl: "muse/window/control",
    closeBehaviorGet: "muse/window/closeBehavior/get",
    closeBehaviorSet: "muse/window/closeBehavior/set",
    menuRendererReady: "muse/menu/rendererReady",
    traySetSessionPreferences: "muse/tray/setSessionPreferences",
    nativeMenuAction: "muse/menu/nativeAction",
  },
  event: {
    pluginChanged: "muse/event/pluginChanged",
    /** Progress of an install or update, while it is still running. */
    pluginInstallProgress: "muse/plugin/event/installProgress",
    /** Host-originated app settings mutation (e.g. plugin `app.setTheme`). */
    settingsChanged: "muse/app/event/settingsChanged",
    configSyncChanged: "muse/configSync/event/changed",
    /** What a running sync is doing, while it is still running. */
    configSyncProgress: "muse/configSync/event/progress",
    extensionsUiPrompt: "muse/extensions/event/uiPrompt",
    extensionsStatus: "muse/extensions/event/status",
    pluginLauncherShown: "muse/pluginLauncher/event/shown",
    agentMessage: "muse/agent/event/message",
    agentQueueChanged: "muse/agent/event/queueChanged",
    hostStatus: "muse/app/event/hostStatus",
    toast: "muse/app/event/toast",
    /**
     * The first plaintext hop to an endpoint the user typed, sent once and only
     * until the shell records `networkPolicy.insecureNoticeAcknowledged`. The
     * shell owns the wording, because the address is not a secret and the copy
     * is localized.
     */
    insecureEndpointNotice: "muse/network/event/insecureEndpointNotice",
    browserState: "muse/browser/event/state",
    browserPreview: "muse/browser/event/preview",
    windowMaximized: "muse/window/event/maximized",
    windowFullScreen: "muse/window/event/fullscreen",
    windowWorkPanelResize: "muse/window/event/workPanelResize",
    menuCommand: "muse/menu/event/command",
    traySessionActivated: "muse/tray/event/sessionActivated",
    notificationChanged: "muse/notification/event/changed",
    sessionsChanged: "muse/session/event/changed",
    notificationActivated: "muse/notification/event/activated",
    plansChanged: "muse/plans/event/changed",
    providersOauth: "muse/providers/oauth/event",
    mcpOauth: "muse/mcp/oauth/event",
    updatesState: "muse/updates/event/state",
    voiceStateChanged: "muse/voice/event/stateChanged",
    voiceModelProgress: "muse/voice/event/modelProgress",
  },
} as const;

export const IPC_WHITELIST = new Set<string>([
  ...Object.values(IPC.invoke),
  ...Object.values(IPC.event),
]);
