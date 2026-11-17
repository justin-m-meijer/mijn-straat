/**
 * Luchtkwaliteitsindex (LKI) van het RIVM, zoals Luchtmeetnet die toont: 1 (weinig) tot 11 (veel vervuiling).
 * Grenzen per stof voor uurwaarden in µg/m³, uit RIVM-rapport 2014-0050 (tabel 7), met klasse 11 uit de
 * herziening van 2019. De index van een station is de hoogste van zijn stoffen.
 * We tonen de gemeten waarde ongewijzigd (licentie CC BY-ND) en zetten er alleen de officiële klasse bij.
 */

// Bovengrens van klasse 1 t/m 10; daarboven klasse 11.
const GRENZEN: Record<string, number[]> = {
  NO2: [10, 20, 30, 45, 60, 75, 100, 125, 150, 200],
  PM10: [10, 20, 30, 45, 60, 75, 100, 125, 150, 200],
  PM25: [10, 15, 20, 30, 40, 50, 70, 90, 100, 140],
  O3: [15, 30, 40, 60, 80, 100, 140, 180, 200, 240],
};

export function lkiVoorStof(stof: string, waarde: number): number | null {
  const g = GRENZEN[stof];
  if (!g) return null;
  const i = g.findIndex((grens) => waarde < grens);
  return i === -1 ? 11 : i + 1;
}

export type Klasse = { label: string; bg: string; fg: string };

// Van groen (goed) via geel en oranje naar rood en paars, zoals de kleurenschaal van Luchtmeetnet,
// iets gedempt zodat het bij het Jumpstart-palet past.
export const LKI_KLEUR = [
  '', // index 0 bestaat niet
  '#9FD1C4', '#74BBA9', '#4FA28F', // goed
  '#F1D98A', '#E9C658', '#DDAE34', // matig
  '#EE9A55', '#DE7432', // onvoldoende
  '#D2504A', '#AE3434', // slecht
  '#76398F', // zeer slecht
];

export function klasse(n: number): Klasse {
  if (n <= 3) return { label: 'Goed', bg: '#DDF0EA', fg: '#1F6152' };
  if (n <= 6) return { label: 'Matig', bg: '#FBF0CC', fg: '#6E5210' };
  if (n <= 8) return { label: 'Onvoldoende', bg: '#FBE2CF', fg: '#83400F' };
  if (n <= 10) return { label: 'Slecht', bg: '#F6D6D3', fg: '#8A2420' };
  return { label: 'Zeer slecht', bg: '#E9DAF0', fg: '#55246B' };
}

export const ADVIES: Record<string, string> = {
  Goed: 'Weinig luchtvervuiling.',
  Matig: 'Mensen met long- of hartklachten kunnen iets merken.',
  Onvoldoende: 'Gevoelige mensen: beperk zware inspanning buiten.',
  Slecht: 'Iedereen: beperk zware inspanning buiten.',
  'Zeer slecht': 'Vermijd inspanning buiten, zeker bij long- of hartklachten.',
};
