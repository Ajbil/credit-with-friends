const MAX_CIRCLE_NAME_CHARACTERS = 40;
const circleNameSegments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function circleNameError(value: string): string | undefined {
  const length = Array.from(circleNameSegments.segment(value.trim())).length;
  return length >= 1 && length <= MAX_CIRCLE_NAME_CHARACTERS ? undefined : 'Use 1 to 40 characters.';
}
