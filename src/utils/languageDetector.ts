// 更精确的日语假名范围（平假名+片假名+半形假名）
const JAPANESE_HIRAGANA = /[\u3040-\u309f]/gu;  // 平假名
const JAPANESE_KATAKANA = /[\u30a0-\u30ff]/gu; // 片假名
const JAPANESE_HALF_KATAKANA = /[\uff66-\uff9f]/gu; // 半形片假名

// 中日韩共用汉字（但日文常用不同范围）
const JAPANESE_KANJI = /[\u4e00-\u9faf]/gu;  // CJK統合漢字（含日文常用漢字）
const CHINESE_CHARS = /[\u4e00-\u9fff]/gu;   // 基本漢字符號
const KOREAN_HANGUL = /[\uac00-\ud7af]/gu;  // 韓文音節
const KOREAN_JAMO = /[\u1100-\u11ff]/gu;    // 韓文字母
const LATIN_CHARS = /[a-zA-Z]/g;

// 日文常用助词和语法标记
const JAPANESE_PARTICLES = /[のはをがにでとへも]/g;
const JAPANESE_GRAMMAR_MARKERS = /[だですますたつてしいるあるないできるれるられるべきことものよね]/g;

function countMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

function isMostlyLatin(text: string): boolean {
  const letters = countMatches(text, LATIN_CHARS);
  const nonWhitespaceLength = text.replace(/\s+/g, '').length;
  if (nonWhitespaceLength === 0) {
    return false;
  }

  return letters / nonWhitespaceLength > 0.6;
}

// 判斷是否為韓文（更準確的音節分析）
function isKorean(text: string): boolean {
  const normalized = text.normalize('NFKC');
  const hangulCount = countMatches(normalized, KOREAN_HANGUL);
  const jamoCount = countMatches(normalized, KOREAN_JAMO);

  // 韓文特徵：有完整的音節文字或字母組合
  return (hangulCount + jamoCount) > 0;
}

// 增強的日文檢測（針對短文本優化）
function isJapanese(text: string): boolean {
  const normalized = text.normalize('NFKC');

  // 日文特徵1：有假名（平假名或片假名）- 高權重特徵
  const hiraganaCount = countMatches(normalized, JAPANESE_HIRAGANA);
  const katakanaCount = countMatches(normalized, JAPANESE_KATAKANA);
  const halfKatakanaCount = countMatches(normalized, JAPANESE_HALF_KATAKANA);
  const kanaCount = hiraganaCount + katakanaCount + halfKatakanaCount;

  // 日文特徵2：有日文常用漢字 + 假名的組合
  const kanjiCount = countMatches(normalized, JAPANESE_KANJI);

  // 日文特徵3：常見日文語法標記
  const particleCount = countMatches(normalized, JAPANESE_PARTICLES);
  const grammarMarkerCount = countMatches(normalized, JAPANESE_GRAMMAR_MARKERS);

  // 對於短文本的特殊處理
  if (normalized.length <= 10) {
    // 只要有假名，就認為是日文（即使很少）
    if (kanaCount > 0) {
      return true;
    }

    // 如果有漢字+日文語法標記，也認為是日文
    if (kanjiCount > 0 && (particleCount > 0 || grammarMarkerCount > 0)) {
      return true;
    }
  }

  // 日文判斷權重系統（適用於較長文本）
  let japaneseScore = 0;
  const totalLength = normalized.length;

  // 假名權重（最高）
  if (kanaCount > 0) {
    japaneseScore += kanaCount * 3; // 假名權重最高
  }

  // 助詞權重（高）
  if (particleCount > 0) {
    japaneseScore += particleCount * 2;
  }

  // 語法標記權重（中）
  if (grammarMarkerCount > 0) {
    japaneseScore += grammarMarkerCount;
  }

  // 漢字權重（低，因為中日韓共享）
  if (kanjiCount > 0) {
    japaneseScore += kanjiCount * 0.5;
  }

  // 計算日文特徵比例
  const japaneseRatio = totalLength > 0 ? japaneseScore / totalLength : 0;

  // 日文判定邏輯
  if (kanaCount > 0) {
    // 只要有假名，且沒有韓文，就認為是日文
    return !isKorean(text);
  }

  // 如果只有漢字，但有日文語法特徵，也認為是日文
  if (kanjiCount > 0 && (particleCount > 0 || grammarMarkerCount > 0)) {
    return !isKorean(text);
  }

  // 如果只有漢字，但日文特徵比例較高，且長度較短，偏向日文
  if (kanjiCount > 0) {
    // 對於短文本，有日文特徵就返回日文
    return !isKorean(text) && (japaneseRatio > 0.1 || text.length <= 10);
  }

  return false;
}

// 增強的中文檢測
function isChinese(text: string): boolean {
  const normalized = text.normalize('NFKC');
  const chineseCount = countMatches(normalized, CHINESE_CHARS);

  // 如果沒有漢字，肯定不是中文
  if (chineseCount === 0) {
    return false;
  }

  // 如果有韓文特徵，先排除
  if (isKorean(text)) {
    return false;
  }

  // 檢查是否明顯是日文
  const hiraganaCount = countMatches(normalized, JAPANESE_HIRAGANA);
  const katakanaCount = countMatches(normalized, JAPANESE_KATAKANA);
  const kanaCount = hiraganaCount + katakanaCount;

  // 如果有假名，肯定是日文而不是中文
  if (kanaCount > 0) {
    return false;
  }

  // 沒有假名，只有漢字的情況下，檢查是否更像是中文
  // 常用中文字符權重
  const commonChineseChars = /[的一是了我不人在他有這個上們時將]/g;
  const commonCount = countMatches(normalized, commonChineseChars);

  // 如果有常用中文字符，或者漢字比例較高，認為是中文
  return commonCount > 0 || (chineseCount / normalized.length) > 0.5;
}

export function detectLanguage(text: string, fallback: string): string {
  if (!text || text.trim().length === 0) {
    return fallback;
  }

  const normalized = text.normalize('NFKC');

  // 優先級：韓文 > 中文 > 日文 > 英文
  // 調整順序以更好地處理中日文混合情況

  if (isKorean(normalized)) {
    return 'ko';
  }

  if (isChinese(normalized)) {
    return 'zh';
  }

  if (isJapanese(normalized)) {
    return 'ja';
  }

  if (isMostlyLatin(normalized)) {
    return 'en';
  }

  return fallback;
}
