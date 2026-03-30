import type { CollageBuildResult } from '@starter/domain';

export interface ArtistTheme {
  cls: string;
  deco: string[];
  script: string;
  emoji: string;
  floats: string[];
  collageBg: string;
}

export type SavedCollageMode = 'autosave' | 'copy';

export interface SavedCollageRecord {
  id: string;
  title: string;
  query: string;
  thumb: string;
  createdAt: string;
  updatedAt: string;
  mode: SavedCollageMode;
  result: CollageBuildResult;
}

export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
export const SAVED_COLLAGES_KEY = 'collage_saved_collages';
export const ACTIVE_COLLAGE_KEY = 'collage_active_collage_id';
export const MAX_SAVED_COLLAGES = 15;

export const LAYOUT_SEQUENCE = [
  'sz-hero', 'sz-large', 'sz-tiny',
  'sz-small', 'sz-small', 'sz-medium',
  'sz-wide', 'sz-medium', 'sz-tiny', 'sz-tiny',
  'sz-large', 'sz-small', 'sz-small', 'sz-tiny',
  'sz-medium', 'sz-medium', 'sz-medium',
  'sz-tiny', 'sz-tiny', 'sz-small', 'sz-large',
  'sz-wide', 'sz-medium', 'sz-small', 'sz-small',
  'sz-tiny', 'sz-tiny', 'sz-tiny', 'sz-tiny', 'sz-tiny', 'sz-tiny',
] as const;

export const ARTIST_THEMES: Record<string, ArtistTheme> = {
  'sabrina carpenter': { cls: 'theme-sabrina-carpenter', deco: ['🎀', '✨', '💖', '🎀'], script: 'xoxo', emoji: '🎀', floats: ['🎀', '💋', '💖', '✨', '🩷', '♡', '🎀', '💗'], collageBg: 'linear-gradient(170deg, #fff5f8 0%, #ffe8ef 40%, #fdd6e4 100%)' },
  'billie eilish': { cls: 'theme-billie-eilish', deco: ['🖤', '🕷️', '💚', '🖤'], script: 'blohsh', emoji: '💚', floats: ['🕷️', '💚', '🖤', '🕸️', '💀', '🐍', '🖤', '💚'], collageBg: 'linear-gradient(170deg, #f1f9ef 0%, #dcefd6 40%, #c8e6be 100%)' },
  'taylor swift': { cls: 'theme-taylor-swift', deco: ['⭐', '🦋', '💛', '⭐'], script: 'the eras', emoji: '🦋', floats: ['⭐', '🦋', '✨', '💛', '🌟', '✨', '⭐', '🦋'], collageBg: 'linear-gradient(170deg, #fdf8f0 0%, #f9ecd4 40%, #f2ddb5 100%)' },
  'olivia rodrigo': { cls: 'theme-olivia-rodrigo', deco: ['🔮', '💜', '🦋', '🔮'], script: 'guts', emoji: '🔮', floats: ['🔮', '💜', '🦋', '💔', '🔮', '⚡', '💜', '🦋'], collageBg: 'linear-gradient(170deg, #faf4ff 0%, #f0e0fa 40%, #e4ccf5 100%)' },
  'reneé rapp': { cls: 'theme-rene-rapp', deco: ['💙', '✨', '🎭', '💙'], script: 'snow angel', emoji: '💙', floats: ['💙', '❄️', '✨', '🎭', '💙', '⭐', '❄️', '✨'], collageBg: 'linear-gradient(170deg, #f5f5ff 0%, #e4e6fa 40%, #d2d5f5 100%)' },
  'zara larsson': { cls: 'theme-zara-larsson', deco: ['🌻', '✨', '🔥', '🌻'], script: 'venus', emoji: '🌻', floats: ['🌻', '☀️', '✨', '🔥', '💛', '🌻', '☀️', '✨'], collageBg: 'linear-gradient(170deg, #fffaf2 0%, #fdecd0 40%, #f8dbb0 100%)' },
  'pinkpantheress': { cls: 'theme-pinkpantheress', deco: ['🩷', '🎀', '💗', '🩷'], script: 'heaven knows', emoji: '🩷', floats: ['🩷', '💗', '🫧', '✨', '🎀', '💕', '🫧', '🩷'], collageBg: 'linear-gradient(170deg, #fff5fa 0%, #ffe0f0 40%, #fcc8e4 100%)' },
  'tate mcrae': { cls: 'theme-tate-mcrae', deco: ['💎', '🖤', '💙', '💎'], script: 'think later', emoji: '💎', floats: ['💎', '💙', '🖤', '✨', '💎', '🌊', '💙', '✨'], collageBg: 'linear-gradient(170deg, #f4f8fc 0%, #dde8f4 40%, #c4d8ec 100%)' },
  'sza': { cls: 'theme-sza', deco: ['🌿', '✨', '💚', '🌿'], script: 'SOS', emoji: '🌿', floats: ['🌿', '💚', '🦋', '✨', '🍃', '🌙', '🌿', '💚'], collageBg: 'linear-gradient(170deg, #f2faf5 0%, #d8f0e2 40%, #bee6cc 100%)' },
  'ariana grande': { cls: 'theme-ariana-grande', deco: ['☁️', '💅', '💗', '☁️'], script: 'and i', emoji: '☁️', floats: ['☁️', '💗', '💅', '✨', '☁️', '🌸', '💗', '✨'], collageBg: 'linear-gradient(170deg, #fef8ff 0%, #f5e0fa 40%, #eac8f5 100%)' },
  bts: { cls: 'theme-bts', deco: ['💜', '⟭⟬', '✨', '💜'], script: 'forever', emoji: '💜', floats: ['💜', '✨', '💜', '⭐', '💜', '✨', '💜', '⭐'], collageBg: 'linear-gradient(170deg, #f5f3ff 0%, #e2defa 40%, #cec8f5 100%)' },
  drake: { cls: 'theme-drake', deco: ['🦉', '6️⃣', '🔥', '🦉'], script: 'OVO', emoji: '🦉', floats: ['🦉', '🔥', '6️⃣', '✨', '🦉', '🏀', '🔥', '✨'], collageBg: 'linear-gradient(170deg, #f8f4ee 0%, #ecdcc8 40%, #dfc8a8 100%)' },
};

export const DEFAULT_THEME: ArtistTheme = {
  cls: '',
  deco: ['🎀', '✨', '💖', '🎀'],
  script: 'forever',
  emoji: '✨',
  floats: ['✨', '💖', '🎀', '⭐', '✨', '💫', '🌟', '💖'],
  collageBg: 'linear-gradient(170deg, #fff5f7 0%, #ffe8ef 40%, #fdd6e4 100%)',
};

export const QUICK_PICKS = [
  'Sabrina Carpenter',
  'Billie Eilish',
  'Taylor Swift',
  'Olivia Rodrigo',
  'Reneé Rapp',
  'Zara Larsson',
  'PinkPantheress',
  'Tate McRae',
  'SZA',
  'Ariana Grande',
] as const;
