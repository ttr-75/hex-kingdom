import { BiomeType, ResourceType } from '../types';
import { BIOME_DEFINITIONS } from './biomes';
import { RESOURCE_DEFINITIONS } from './resources';

/**
 * UI & Rendering Farben
 * Single Point of Truth für alle Farb-Definitionen im Spiel
 */

// ===========================
// BIOME FARBEN
// ===========================

/**
 * Biom-Farben für Rendering (Hex-Format)
 * Extrahiert aus BIOME_DEFINITIONS - Single Point of Truth
 */
export const BIOME_COLORS: Record<BiomeType, number> = Object.entries(BIOME_DEFINITIONS).reduce((acc, [biomeType, definition]) => {
  acc[biomeType as BiomeType] = parseInt(definition.color.replace('#', ''), 16);
  return acc;
}, {} as Record<BiomeType, number>);

/**
 * Schatten-Farben für Biome (für 3D-Effekte)
 * Extrahiert aus BIOME_DEFINITIONS - Single Point of Truth
 */
export const BIOME_SHADOWS: Record<BiomeType, number> = Object.entries(BIOME_DEFINITIONS).reduce((acc, [biomeType, definition]) => {
  acc[biomeType as BiomeType] = parseInt(definition.shadowColor.replace('#', ''), 16);
  return acc;
}, {} as Record<BiomeType, number>);

// ===========================
// RESSOURCEN FARBEN
// ===========================

/**
 * Ressourcen-Farben für UI und Rendering
 * Extrahiert aus RESOURCE_DEFINITIONS - Single Point of Truth
 */
export const RESOURCE_COLORS: Record<ResourceType, number> = Object.entries(RESOURCE_DEFINITIONS).reduce((acc, [resourceType, definition]) => {
  acc[resourceType as ResourceType] = parseInt(definition.color.replace('#', ''), 16);
  return acc;
}, {} as Record<ResourceType, number>);

// ===========================
// UI FARBEN
// ===========================

/**
 * Standard UI-Farben für konsistente Darstellung
 */
export const UI_COLORS = {
  primary: 0x4CAF50,      // Grün - Haupt-Aktionsfarbe
  secondary: 0x2196F3,    // Blau - Sekundäre Aktionen
  success: 0x4CAF50,      // Grün - Erfolg
  warning: 0xFFA726,      // Orange - Warnung
  danger: 0xFF5252,       // Rot - Gefahr/Fehler
  info: 0x42A5F5,         // Hellblau - Information
  neutral: 0x9E9E9E,      // Grau - Neutral
  
  // Territorium & Ownership
  ownTerritory: 0x4CAF50,     // Eigenes Territorium
  enemyTerritory: 0xFF5252,   // Feindliches Territorium
  neutralTerritory: 0x9E9E9E, // Neutrales Territorium
  
  // Fog of War
  explored: 0x666666,     // Erkundete aber nicht sichtbare Tiles (grau)
  visible: 0xFFFFFF,      // Voll sichtbare Tiles (normal)
  unknown: 0x0a0a15       // Unerkundete Tiles (dunkel)
} as const;

/**
 * Konvertiert Hex-Farbe (0xRRGGBB) zu CSS-String (#RRGGBB)
 */
export function hexToCSS(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/**
 * Konvertiert CSS-String (#RRGGBB) zu Hex-Farbe (0xRRGGBB)
 */
export function cssToHex(css: string): number {
  return parseInt(css.replace('#', ''), 16);
}
