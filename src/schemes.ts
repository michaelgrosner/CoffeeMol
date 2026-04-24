'use strict';

import {
  RGB,
  SecondaryStructureType,
  ColorScheme,
  atom_colors,
} from './types';

export const defaultColorScheme: ColorScheme = {
  atom_colors: { ...atom_colors },
  ss_colors: {
    helix: [255, 0, 255], // Magenta
    sheet: [255, 255, 0], // Yellow
    loop: [140, 140, 140], // Gray
  },
  chain_colors: [
    [64, 64, 255], [64, 255, 64], [255, 64, 64], [255, 255, 64],
    [255, 64, 255], [64, 255, 255], [255, 128, 64], [128, 64, 255],
  ],
  hydrophobicity_scale: {
    ILE: 4.5, VAL: 4.2, LEU: 3.8, PHE: 2.8, CYS: 2.5, MET: 1.9, ALA: 1.8,
    GLY: -0.4, THR: -0.7, SER: -0.8, TRP: -0.9, TYR: -1.3, PRO: -1.6,
    HIS: -3.2, GLU: -3.5, GLN: -3.5, ASP: -3.5, ASN: -3.5, LYS: -3.9, ARG: -4.5,
  },
  ramp_low: [0, 0, 255],
  ramp_high: [255, 0, 0],
  outline_weight: 1.1,
  glow_intensity: 0,
};

export const highContrastScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [255, 255, 255],
    N: [255, 255, 0],
    O: [255, 0, 0],
    H: [0, 255, 255],
  },
  ss_colors: {
    helix: [255, 0, 0],
    sheet: [0, 255, 0],
    loop: [255, 255, 255],
  },
  ramp_low: [0, 0, 255],
  ramp_high: [255, 0, 0],
  outline_weight: 2.0,
  glow_intensity: 0,
  background: '#000000',
};

export const nordScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [216, 222, 233],
    N: [129, 161, 193],
    O: [191, 97, 106],
  },
  ss_colors: {
    helix: [136, 192, 208],
    sheet: [163, 190, 140],
    loop: [216, 222, 233],
  },
  chain_colors: [[136, 192, 208], [129, 161, 193], [180, 142, 173], [163, 190, 140]],
  ramp_low: [129, 161, 193],
  ramp_high: [191, 97, 106],
  outline_weight: 1.5,
  glow_intensity: 0,
  background: '#2E3440',
};

export const solarizedDarkScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [147, 161, 161],
    N: [38, 139, 210],
    O: [220, 50, 47],
  },
  ss_colors: {
    helix: [38, 139, 210],
    sheet: [133, 153, 0],
    loop: [131, 148, 150],
  },
  chain_colors: [[38, 139, 210], [133, 153, 0], [181, 137, 0], [211, 54, 130]],
  ramp_low: [38, 139, 210],
  ramp_high: [220, 50, 47],
  outline_weight: 1.2,
  glow_intensity: 0,
  background: '#002B36',
};

export const draculaScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [248, 248, 242],
    N: [139, 233, 253],
    O: [255, 85, 85],
  },
  ss_colors: {
    helix: [189, 147, 249],
    sheet: [80, 250, 123],
    loop: [248, 248, 242],
  },
  chain_colors: [[189, 147, 249], [255, 121, 198], [139, 233, 253], [80, 250, 123]],
  ramp_low: [139, 233, 253],
  ramp_high: [255, 85, 85],
  outline_weight: 1.2,
  glow_intensity: 8,
  background: '#282A36',
};

export const synthwave84Scheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [254, 250, 115],
    N: [54, 249, 246],
    O: [255, 126, 219],
  },
  ss_colors: {
    helix: [255, 126, 219],
    sheet: [54, 249, 246],
    loop: [254, 250, 115],
  },
  chain_colors: [[255, 126, 219], [54, 249, 246], [254, 250, 115], [114, 248, 154]],
  ramp_low: [54, 249, 246],
  ramp_high: [255, 126, 219],
  outline_weight: 1.3,
  glow_intensity: 15,
  background: '#262335',
};

export const gruvboxDarkScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [235, 219, 178],
    N: [131, 165, 152],
    O: [251, 73, 52],
  },
  ss_colors: {
    helix: [251, 73, 52],
    sheet: [184, 187, 38],
    loop: [235, 219, 178],
  },
  chain_colors: [[251, 73, 52], [184, 187, 38], [250, 189, 47], [131, 165, 152]],
  ramp_low: [131, 165, 152],
  ramp_high: [251, 73, 52],
  outline_weight: 1.4,
  glow_intensity: 0,
  background: '#282828',
};

export const tokyoNightScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [192, 202, 245],
    N: [122, 162, 247],
    O: [247, 118, 142],
  },
  ss_colors: {
    helix: [122, 162, 247],
    sheet: [158, 206, 106],
    loop: [192, 202, 245],
  },
  chain_colors: [[122, 162, 247], [158, 206, 106], [187, 154, 247], [42, 195, 222]],
  ramp_low: [122, 162, 247],
  ramp_high: [247, 118, 142],
  outline_weight: 1.2,
  glow_intensity: 5,
  background: '#1A1B26',
};

export const oneDarkScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [171, 178, 191],
    N: [97, 175, 239],
    O: [224, 108, 117],
  },
  ss_colors: {
    helix: [97, 175, 239],
    sheet: [152, 195, 121],
    loop: [171, 178, 191],
  },
  chain_colors: [[97, 175, 239], [152, 195, 121], [198, 120, 221], [209, 154, 102]],
  ramp_low: [97, 175, 239],
  ramp_high: [224, 108, 117],
  outline_weight: 1.1,
  glow_intensity: 0,
  background: '#282C34',
};

export const coffeeScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [210, 180, 140],
    N: [245, 245, 220],
    O: [160, 82, 45],
  },
  ss_colors: {
    helix: [210, 180, 140],
    sheet: [245, 245, 220],
    loop: [160, 82, 45],
  },
  chain_colors: [[210, 180, 140], [245, 245, 220], [160, 82, 45], [139, 69, 19]],
  ramp_low: [245, 245, 220],
  ramp_high: [139, 69, 19],
  outline_weight: 1.8,
  glow_intensity: 0,
  background: '#3C2F2F',
};

export const monochromeScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    C: [100, 100, 100], N: [150, 150, 150], O: [200, 200, 200],
    H: [230, 230, 230], S: [80, 80, 80], P: [120, 120, 120], _: [100, 100, 100]
  },
  ss_colors: {
    helix: [60, 60, 60],
    sheet: [120, 120, 120],
    loop: [200, 200, 200],
  },
  chain_colors: [[50, 50, 50], [100, 100, 100], [150, 150, 150], [200, 200, 200]],
  ramp_low: [50, 50, 50],
  ramp_high: [200, 200, 200],
  outline_weight: 1.0,
  glow_intensity: 0,
};

export const neonScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    C: [57, 255, 20],   // Neon Green
    N: [255, 0, 255],   // Neon Magenta
    O: [0, 255, 255],   // Neon Cyan
    H: [255, 255, 255],
    P: [255, 110, 199], // Neon Pink
    S: [255, 211, 0],   // Neon Yellow
    _: [150, 150, 150]
  },
  ss_colors: {
    helix: [255, 0, 255],
    sheet: [57, 255, 20],
    loop: [0, 255, 255],
  },
  chain_colors: [[255, 0, 255], [57, 255, 20], [0, 255, 255], [255, 110, 199]],
  ramp_low: [0, 255, 255],
  ramp_high: [255, 0, 255],
  outline_weight: 1.5,
  glow_intensity: 20,
  background: '#000000',
};

export const molokaiScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [248, 248, 242], // Foreground
    N: [102, 217, 239], // Cyan
    O: [249, 38, 114],  // Magenta
    S: [253, 151, 31],  // Orange
    P: [174, 129, 255], // Purple
    H: [230, 219, 116], // Yellow
  },
  ss_colors: {
    helix: [249, 38, 114], // Magenta
    sheet: [166, 226, 46],  // Green
    loop: [117, 113, 94],   // Gray (Comments)
  },
  chain_colors: [
    [102, 217, 239], [166, 226, 46], [253, 151, 31], [174, 129, 255],
  ],
  ramp_low: [102, 217, 239],
  ramp_high: [249, 38, 114],
  outline_weight: 1.2,
  glow_intensity: 0,
  background: '#272822',
};

export const colorSchemes: Record<string, ColorScheme> = {
  default: defaultColorScheme,
  highContrast: highContrastScheme,
  nord: nordScheme,
  solarizedDark: solarizedDarkScheme,
  dracula: draculaScheme,
  synthwave84: synthwave84Scheme,
  gruvboxDark: gruvboxDarkScheme,
  tokyoNight: tokyoNightScheme,
  oneDark: oneDarkScheme,
  coffee: coffeeScheme,
  monochrome: monochromeScheme,
  neon: neonScheme,
  molokai: molokaiScheme,
};
