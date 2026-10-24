export type CardMatchKind = 'all' | 'matching' | 'similar' | 'unstated';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// The first column can start at any card character, so the distance is to a substring.
function hasNearbySubstring(entry: string, card: string, allowance: number): boolean {
  const wanted = Array.from(entry);
  let previous = wanted.map((_, index) => index + 1);
  previous.unshift(0);
  for (const character of card) {
    const current = [0];
    for (let index = 1; index <= wanted.length; index += 1) {
      current[index] = Math.min(
        previous[index]! + 1,
        current[index - 1]! + 1,
        previous[index - 1]! + (wanted[index - 1] === character ? 0 : 1),
      );
    }
    if (current[wanted.length]! <= allowance) return true;
    previous = current;
  }
  return false;
}

export function matchCardVariant(entry: string | undefined, cardVariant: string | null): CardMatchKind | null {
  const wanted = normalize(entry?.trim() ?? '');
  if (!wanted) return 'all';
  if (!cardVariant) return 'unstated';
  const card = normalize(cardVariant);
  if (card.includes(wanted)) return 'matching';
  const allowance = Array.from(wanted).length < 4 ? 0 : Array.from(wanted).length < 8 ? 1 : 2;
  return hasNearbySubstring(wanted, card, allowance) ? 'similar' : null;
}
