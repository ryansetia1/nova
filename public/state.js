/* ============================================
   NOVA — State & DOM
   ============================================ */

export const CHARACTERS = {
  Char1: {
    name: 'Character 1',
    walk: { count: 31, path: (i) => `assets/characters/Char1/Walk/Char1Walk_${(i + 1).toString().padStart(5, '0')}.png` },
    idle: { count: 86, path: (i) => `assets/characters/Char1/Idle/Char1Idle_${(i + 1).toString().padStart(5, '0')}.png` }
  },
  Char2: {
    name: 'Character 2',
    walk: { count: 34, path: (i) => `assets/characters/Char2/Walk/frame_${(i + 1).toString().padStart(3, '0')}.png` },
    idle: { count: 240, path: (i) => `assets/characters/Char2/Idle/frame_${(i + 1).toString().padStart(3, '0')}.png` }
  }
};

export const state = {
  projects: [],
  agentToDelete: null,
  terminals: {}, 
  draggingWindow: null, // the element being dragged
  dragOffset: { x: 0, y: 0 },
  resizingWindow: null,
  resizeStart: { w: 0, h: 0, x: 0, y: 0 },
  topZIndex: 100000,
  selectedEmoji: '🪐',
  updateSelectedEmoji: '🪐',
  spawnAppearanceType: 'emoji', // 'emoji' or 'character'
  updateAppearanceType: 'emoji',
  walkingRobots: {}, // { name: { x, y, tx, ty, speed, isWalking, isHovered, isThinking, hasUpdate, frame, forcedTarget, activity, activityFrame } }
  projectForEmojiUpdate: null,
  breakPositions: [], // { id, x, y, emoji, animation, command }
  foregroundObjects: [], // { id, x, y, rotation, scale, asset, positionId }
  objectAssets: [], // ['dispenser', ...]
  
  // Pre-calculated frames for all characters
  characterFrames: {}, // { charId: { animationName: [paths] } }

  // Initial legacy support
  get charFrames() { return (this.characterFrames['Char1']?.walk) || []; },
  get idleFrames() { return (this.characterFrames['Char1']?.idle) || []; },
  
  anchor: { x: 50, y: 85 },
  originalAnchor: { x: 50, y: 85 }
};

export const $ = (sel) => document.querySelector(sel);

export const dom = {
  get clock() { return $('#clock'); },
  get spawnBtn() { return $('#spawn-btn'); },
  get modal() { return $('#spawn-modal'); },
  get modalInput() { return $('#project-name-input'); },
  get nicknameInput() { return $('#nickname-input'); },
  get customPathInput() { return $('#custom-path-input'); },
  get modelSelect() { return $('#model-select'); },
  get customModelInput() { return $('#custom-model-input'); },
  get serviceToggleBtns() { return document.querySelectorAll('.service-btn'); },
  get modalCancel() { return $('#modal-cancel-btn'); },
  get modalConfirm() { return $('#modal-confirm-btn'); },
  get orphanedGroup() { return $('#orphaned-selector-group'); },
  get orphanedSelect() { return $('#orphaned-select'); },
  get nestParentSelect() { return $('#nest-parent-select'); },
  get serviceConfigFields() { return $('#service-config-fields'); },
  get apiKeyGroup() { return $('#api-key-group'); },
  get apiKeyInput() { return $('#api-key-input'); },
  get baseUrlGroup() { return $('#base-url-group'); },
  get baseUrlInput() { return $('#base-url-input'); },
  get folderHint() { return $('.modal-hint:last-of-type'); },
  get robotCards() { return $('#robot-cards'); },
  get emptyState() { return $('#empty-state'); },
  get mainContent() { return $('#main-content'); },
  get terminalTemplate() { return $('#terminal-template'); },
  get toastContainer() { return $('#toast-container'); },
  get particles() { return $('#particles'); },
  get deleteModal() { return $('#delete-modal'); },
  get deleteAgentName() { return $('#delete-agent-name'); },
  get deleteCancelBtn() { return $('#delete-cancel-btn'); },
  get deleteAgentOnlyBtn() { return $('#delete-agent-only-btn'); },
  get deleteConfirmBtn() { return $('#delete-confirm-btn'); },
  get settingsBtn() { return $('#settings-btn'); },
  get settingsMenu() { return $('#settings-menu'); },
  get toggleVisualsBtn() { return $('#toggle-visuals-btn'); },
  get toggleStyleBtn() { return $('#toggle-style-btn'); },
  get emojiPicker() { return $('#emoji-picker'); },
  get emojiPreview() { return $('#selected-emoji-preview'); },
  get emojiUpdateModal() { return $('#emoji-update-modal'); },
  get emojiUpdateCancel() { return $('#emoji-update-cancel-btn'); },
  get emojiUpdateSaveBtn() { return $('#emoji-update-save-btn'); },
  get updateEmojiPicker() { return $('#update-emoji-picker'); },
  
  // Per-Agent Style Selectors
  get spawnTypeToggle() { return $('#spawn-avatar-type-toggle'); },
  get spawnEmojiZone() { return $('#spawn-emoji-trigger-area'); },
  get spawnCharZone() { return $('#spawn-character-hint-area'); },
  get spawnCharacterArea() { return $('#spawn-character-area'); },
  get spawnCharacterSelect() { return $('#spawn-character-select'); },

  get updateTypeToggle() { return $('#update-avatar-type-toggle'); },
  get updateEmojiArea() { return $('#update-emoji-area'); },
  get updateCharacterArea() { return $('#update-character-area'); },
  get updateCharacterSelect() { return $('#update-character-select'); },
  get updateEmojiPreview() { return $('#update-emoji-preview'); },
  get updateEmojiHint() { return $('#update-emoji-hint-container'); },

  // New Emoji Popover elements
  get emojiTrigger() { return $('#emoji-trigger'); },
  get emojiPopover() { return $('#emoji-popover'); },
  get modalEmojiPicker() { return $('#modal-emoji-picker'); },

  // Loader
  get loader() { return $('#app-loader'); },
  get loaderProgress() { return $('#loader-progress'); },
  get loaderStatus() { return $('.loader-status'); },

  // Anchor Adj
  get inputAnchorX() { return $('#input-anchor-x'); },
  get inputAnchorY() { return $('#input-anchor-y'); },
  get valAnchorX() { return $('#val-anchor-x'); },
  get valAnchorY() { return $('#val-anchor-y'); },
  // Sidebar Elements
  get sidebar() { return $('#agent-sidebar'); },
  get sidebarToggle() { return $('#sidebar-toggle'); },
  get activeAgentList() { return $('#active-agent-list'); },
  get orphanedFolderList() { return $('#orphaned-folder-list'); },
  get activeCount() { return $('#active-count'); },
  get orphanedCount() { return $('#orphaned-count'); },
  
  // Youtube Player
  get youtubeUrlInput() { return $('#youtube-url-input'); },
  get youtubeLoadBtn() { return $('#youtube-load-btn'); },
  get youtubePlayer() { return $('#sidebar-youtube-player'); },
  get headerPlayBtn() { return $('#header-play-btn'); },
  
  // CLAUDE.md Modal
  get claudeMdModal() { return $('#claude-md-modal'); },
  get claudeMdTextarea() { return $('#claude-md-textarea'); },
  get claudeMdLabel() { return $('#claude-md-project-label'); },
  get claudeMdCancelBtn() { return $('#claude-md-cancel-btn'); },
  get claudeMdSaveBtn() { return $('#claude-md-save-btn'); },
  // Switch Service Modal
  get switchServiceModal() { return $('#switch-service-modal'); },
  get switchServiceProjectName() { return $('#switch-service-project-name'); },
  get switchServiceToggleBtns() { return document.querySelectorAll('.switch-service-btn'); },
  get switchServiceConfigFields() { return $('#switch-service-config-fields'); },
  get switchApiKeyGroup() { return $('#switch-api-key-group'); },
  get switchApiKeyInput() { return $('#switch-api-key-input'); },
  get switchBaseUrlGroup() { return $('#switch-base-url-group'); },
  get switchBaseUrlInput() { return $('#switch-base-url-input'); },
  get switchModelSelect() { return $('#switch-model-select'); },
  get switchCustomModelInput() { return $('#switch-custom-model-input'); },
  get switchServiceCancelBtn() { return $('#switch-service-cancel-btn'); },
  get switchServiceSaveBtn() { return $('#switch-service-save-btn'); }
};
