/* ============================================
   NOVA — State & DOM
   ============================================ */

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
  walkingRobots: {}, // { name: { x, y, tx, ty, speed, isWalking, isHovered, isThinking, hasUpdate, frame } }
  projectForEmojiUpdate: null,
  charFrames: Array.from({ length: 31 }, (_, i) => `assets/characters/Char1/Walk/Char1Walk_${(i + 1).toString().padStart(5, '0')}.png`),
  idleFrames: Array.from({ length: 86 }, (_, i) => `assets/characters/Char1/Idle/Char1Idle_${(i + 1).toString().padStart(5, '0')}.png`),
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
};
