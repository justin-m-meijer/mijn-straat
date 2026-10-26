// Jumpstart Media-palet, gemeten uit de merkbestanden.
export const colors = {
  ink: '#1F4E63',
  inkDark: '#173A4C',
  media: '#6E93A6',
  sand: '#E7DFC9',
  sage: '#B0CCCB',
  ivory: '#F7F5EF',
  white: '#FFFFFF',
  text: '#111827',
  textMuted: '#4B5563',
  border: '#E5E7EB',
  inputBorder: '#9CA3AF',
};

export const fonts = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extrabold: 'Figtree_800ExtraBold',
};

export type Category = 'vergunning' | 'verkeer' | 'raad' | 'evenement' | 'regels' | 'overig';

export const categories: Record<Category, { label: string; bg: string; fg: string; letter: string }> = {
  vergunning: { label: 'Vergunning', bg: '#EFE8D6', fg: '#6B5426', letter: 'V' },
  verkeer: { label: 'Verkeer', bg: '#F3E3D3', fg: '#7A4A22', letter: 'W' },
  raad: { label: 'Gemeenteraad', bg: '#DFE7EC', fg: '#2F4F63', letter: 'R' },
  evenement: { label: 'Evenement', bg: '#DCEBEA', fg: '#2D5E5B', letter: 'E' },
  regels: { label: 'Regels', bg: '#ECE9F2', fg: '#4A4363', letter: 'G' },
  overig: { label: 'Overig', bg: '#EEECE5', fg: '#4B5563', letter: 'O' },
};
