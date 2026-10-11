// The world each costume lives in. A theme is data (colors) plus the drawers from theme-art.ts; the
// scene stacks them (sky, far scenery, ground, weather) behind the same bugs, clouds and crab, which
// look the same in every theme and stand where they always did: a theme changes the picture, never
// the play. The tests hold every theme to that (they check what is behind the play against the
// colors of what is in front of it).
//
// Themes are keyed by costume, so a crab that wears one costume for the whole run (setting `costume`)
// keeps its world, and the journey (stages.ts) is nothing but a costume change.

import type { CostumeId } from '../../types'
import * as art from './theme-art'
import type { Drawer } from './theme-art'

export type { Drawer }

export type Far = {
  /** how many times slower than the ground it scrolls; far things are slow */
  k: number
  draw: Drawer
}

export type Theme = {
  id: CostumeId
  /** the title shown when the journey comes to it */
  name: string
  /** the colors of the text over it: the score, and the quieter lines; `null` is the card's own, light or dark */
  ink: { strong: string | null; dim: string | null }
  /** the color of the floating "+25" (null: the card's own) */
  pop: string | null
  /** the sky as bands from the top down, or null to leave the card showing through */
  sky: readonly string[] | null
  /** scenery, far to near */
  far: readonly Far[]
  /** the ground: its fill under the line (null: none), the line, and what is scattered on it, which scrolls with it */
  floor: { fill: string | null; line: string | null; draw: Drawer }
  /** weather and other things that loop by themselves, in front of the scenery and behind the play */
  fx: (w: number, ground: number, height: number) => string
  /** the colors that sit behind the bugs and the crab, for the readability tests (null: the card) */
  lane: readonly string[] | null
}

const none = () => ''

export const THEMES: Record<CostumeId, Theme> = {
  plain: {
    id: 'plain',
    name: 'MEADOW',
    ink: { strong: null, dim: null },
    pop: null,
    sky: null,
    far: [
      { k: 5, draw: art.meadowHills },
      { k: 11, draw: art.meadowStars },
      { k: 6, draw: art.meadowClouds },
    ],
    floor: { fill: null, line: null, draw: art.meadowFloor },
    fx: none,
    lane: null,
  },
  swimmer: {
    id: 'swimmer',
    name: 'BEACH',
    ink: { strong: '#3E3A2E', dim: '#6C6350' },
    pop: '#6B4A00',
    sky: ['#FFF6DC', '#FFEFC9', '#FFE7B5'],
    far: [
      { k: 14, draw: art.beachSun },
      { k: 12, draw: art.beachSea },
      { k: 4, draw: art.beachPalms },
    ],
    floor: { fill: '#F0D8A2', line: '#D6BC84', draw: art.beachFloor },
    fx: art.beachFx,
    lane: ['#FFF6DC', '#FFEFC9', '#FFE7B5', '#7ED3E0', '#5DB9CC'],
  },
  chef: {
    id: 'chef',
    name: 'KITCHEN',
    ink: { strong: '#3B3226', dim: '#6F6350' },
    pop: '#6B4A00',
    sky: ['#F7ECD6', '#F4E6CC', '#F0E0C2'],
    far: [
      { k: 4, draw: art.kitchenTiles },
      { k: 6, draw: art.kitchenWindow },
      { k: 3, draw: art.kitchenShelves },
    ],
    floor: { fill: '#D6BC92', line: '#8C6B4A', draw: art.kitchenFloor },
    fx: none,
    lane: ['#F7ECD6', '#F4E6CC', '#F0E0C2', '#E9DABA'],
  },
  racer: {
    id: 'racer',
    name: 'SPEEDWAY',
    ink: { strong: '#2C3340', dim: '#5A6577' },
    pop: '#6B4A00',
    sky: ['#EEF5FB', '#E5EFF8', '#DCE9F5'],
    far: [
      { k: 4, draw: art.speedwayStands },
      { k: 2, draw: art.speedwayBoards },
    ],
    floor: { fill: '#D9DBE0', line: '#B4B7BF', draw: art.speedwayFloor },
    fx: art.speedwayFx,
    lane: ['#EEF5FB', '#E5EFF8', '#DCE9F5', '#B5BDCB'],
  },
  engineer: {
    id: 'engineer',
    name: 'BUILD SITE',
    ink: { strong: '#2E3338', dim: '#5B636B' },
    pop: '#6B4A00',
    sky: ['#E4E9EE', '#DCE2E8', '#D3DAE1'],
    far: [
      { k: 5, draw: art.siteCranes },
      { k: 2.5, draw: art.siteFrames },
    ],
    floor: { fill: '#BDB5A3', line: '#8E8775', draw: art.siteFloor },
    fx: none,
    lane: ['#E4E9EE', '#DCE2E8', '#D3DAE1', '#B5AE9B'],
  },
  detective: {
    id: 'detective',
    name: 'RAINY CITY',
    ink: { strong: '#EDEFF5', dim: '#A8B1C7' },
    pop: '#FFD76A',
    sky: ['#161C2B', '#1B2335', '#212B40'],
    far: [
      { k: 9, draw: art.cityFar },
      { k: 4, draw: art.cityNear },
      { k: 1, draw: art.cityLamps },
    ],
    floor: { fill: '#252C3C', line: '#47536F', draw: art.cityFloor },
    fx: art.cityFx,
    lane: ['#161C2B', '#1B2335', '#212B40', '#27314A', '#313D5A'],
  },
  pirate: {
    id: 'pirate',
    name: 'STORM AT SEA',
    ink: { strong: '#EEF4F6', dim: '#A9BDC6' },
    pop: '#FFD76A',
    sky: ['#141E24', '#19262D', '#1F2F37'],
    far: [
      { k: 7, draw: art.stormClouds },
      { k: 9, draw: art.stormShip },
      { k: 8, draw: art.stormWavesFar },
      { k: 3, draw: art.stormWavesNear },
    ],
    floor: { fill: '#6A4E32', line: '#A88557', draw: art.stormFloor },
    fx: art.stormFx,
    lane: ['#141E24', '#19262D', '#1F2F37', '#1B323B', '#223E49'],
  },
  astronaut: {
    id: 'astronaut',
    name: 'MOON',
    ink: { strong: '#F2F4FF', dim: '#A9B0D6' },
    pop: '#FFD76A',
    sky: ['#070912', '#0C0F1E', '#121531'],
    far: [
      { k: 16, draw: art.moonStars },
      { k: 24, draw: art.moonEarth },
      { k: 5, draw: art.moonRidgeFar },
      { k: 2.5, draw: art.moonRidgeNear },
    ],
    floor: { fill: '#8E91A6', line: '#B7BACD', draw: art.moonFloor },
    fx: art.moonFx,
    lane: ['#070912', '#0C0F1E', '#121531', '#1A1E3C', '#232850'],
  },
}

export const themeOf = (id: CostumeId): Theme => THEMES[id]
