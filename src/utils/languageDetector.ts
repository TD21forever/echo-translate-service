const JAPANESE_REGEX = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf]/gu;
const CHINESE_REGEX = /[\u4e00-\u9fff]/gu;
const KOREAN_REGEX = /[\uac00-\ud7af]/gu;
const LATIN_REGEX = /[a-zA-Z]/g;

function countMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

function isMostlyLatin(text: string): boolean {
  const letters = countMatches(text, LATIN_REGEX);
  const nonWhitespaceLength = text.replace(/\s+/g, '').length;
  if (nonWhitespaceLength === 0) {
    return false;
  }

  return letters / nonWhitespaceLength > 0.6;
}

export function detectLanguage(text: string, fallback: string): string {
  if (!text || text.trim().length === 0) {
    return fallback;
  }

  const normalized = text.normalize('NFKC');
  const japaneseCount = countMatches(normalized, JAPANESE_REGEX);
  const chineseCount = countMatches(normalized, CHINESE_REGEX);
  const koreanCount = countMatches(normalized, KOREAN_REGEX);

  if (japaneseCount > chineseCount && japaneseCount >= koreanCount && japaneseCount > 0) {
    return 'ja';
  }

  if (koreanCount > chineseCount && koreanCount >= japaneseCount && koreanCount > 0) {
    return 'ko';
  }

  if (chineseCount > 0) {
    return 'zh';
  }

  if (isMostlyLatin(normalized)) {
    return 'en';
  }

  return fallback;
}
