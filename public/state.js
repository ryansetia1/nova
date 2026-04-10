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
  clock: $('#clock'),
  spawnBtn: $('#spawn-btn'),
  modal: $('#spawn-modal'),
  modalInput: $('#project-name-input'),
  nicknameInput: $('#nickname-input'),
  customPathInput: $('#custom-path-input'),
  modelSelect: $('#model-select'),
  modalCancel: $('#modal-cancel-btn'),
  modalConfirm: $('#modal-confirm-btn'),
  orphanedGroup: $('#orphaned-selector-group'),
  orphanedSelect: $('#orphaned-select'),
  robotCards: $('#robot-cards'),
  emptyState: $('#empty-state'),
  mainContent: $('#main-content'),
  terminalTemplate: $('#terminal-template'),
  toastContainer: $('#toast-container'),
  particles: $('#particles'),
  deleteModal: $('#delete-modal'),
  deleteAgentName: $('#delete-agent-name'),
  deleteCancelBtn: $('#delete-cancel-btn'),
  deleteAgentOnlyBtn: $('#delete-agent-only-btn'),
  deleteConfirmBtn: $('#delete-confirm-btn'),
  settingsBtn: $('#settings-btn'),
  settingsMenu: $('#settings-menu'),
  toggleVisualsBtn: $('#toggle-visuals-btn'),
  toggleStyleBtn: $('#toggle-style-btn'),
  emojiPicker: $('#emoji-picker'),
  emojiPreview: $('#selected-emoji-preview'),
  emojiUpdateModal: $('#emoji-update-modal'),
  emojiUpdateCancel: $('#emoji-update-cancel-btn'),
  emojiUpdateSaveBtn: $('#emoji-update-save-btn'),
  updateEmojiPicker: $('#update-emoji-picker'),
  
  // Per-Agent Style Selectors
  spawnTypeToggle: $('#spawn-avatar-type-toggle'),
  spawnEmojiZone: $('#spawn-emoji-trigger-area'),
  spawnCharZone: $('#spawn-character-hint-area'),
  spawnCharacterArea: $('#spawn-character-area'),
  spawnCharacterSelect: $('#spawn-character-select'),

  updateTypeToggle: $('#update-avatar-type-toggle'),
  updateEmojiArea: $('#update-emoji-area'),
  updateCharacterArea: $('#update-character-area'),
  updateCharacterSelect: $('#update-character-select'),
  updateEmojiPreview: $('#update-emoji-preview'),
  updateEmojiHint: $('#update-emoji-hint-container'),

  // New Emoji Popover elements
  emojiTrigger: $('#emoji-trigger'),
  emojiPopover: $('#emoji-popover'),
  modalEmojiPicker: $('#modal-emoji-picker'),

  // Loader
  loader: $('#app-loader'),
  loaderProgress: $('#loader-progress'),
  loaderStatus: $('.loader-status'),

  // Anchor Adj
  inputAnchorX: $('#input-anchor-x'),
  inputAnchorY: $('#input-anchor-y'),
  valAnchorX: $('#val-anchor-x'),
  valAnchorY: $('#val-anchor-y'),
  // Sidebar Elements
  sidebar: $('#agent-sidebar'),
  sidebarToggle: $('#sidebar-toggle'),
  activeAgentList: $('#active-agent-list'),
  orphanedFolderList: $('#orphaned-folder-list'),
  activeCount: $('#active-count'),
  orphanedCount: $('#orphaned-count'),
  
  // Youtube Player
  youtubeUrlInput: $('#youtube-url-input'),
  youtubeLoadBtn: $('#youtube-load-btn'),
  youtubePlayer: $('#sidebar-youtube-player'),
  headerPlayBtn: $('#header-play-btn'),
};
