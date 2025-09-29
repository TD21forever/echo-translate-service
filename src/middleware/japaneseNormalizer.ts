/**
 * 日语归一化中间件
 * 在ASR分析之后、送入翻译之前进行预处理
 */

// 同音词替换规则（根据语境）
const HOMOPHONE_REPLACEMENTS: Array<{
  pattern: RegExp;
  replacement: string;
  contextKeywords: string[];
  description: string;
}> = [
  {
    pattern: /入って(ない|ません)/g,
    replacement: '履いて$1', // 入ってない → 履いてない
    contextKeywords: ['靴', 'スニーカー', 'ブーツ', 'サンダル', '履物', '足', '靴下', 'タイツ', 'ズボン', 'パンツ', 'スカート', '着', 'これ', 'それ', 'あれ'],
    description: '穿戴语境下的同音词替换'
  },
  {
    pattern: /入っ(た|ています)/g,
    replacement: '履い$1', // 入った → 履いた
    contextKeywords: ['靴', 'スニーカー', 'ブーツ', 'サンダル', '履物', '足', '靴下', 'タイツ', 'ズボン', 'パンツ', 'スカート', '着', 'これ', 'それ', 'あれ'],
    description: '穿戴语境下的同音词替换'
  }
];

// 口语正规化规则
const COLLOQUIAL_NORMALIZATIONS: Array<{
  pattern: RegExp;
  replacement: string;
  description: string;
}> = [
  {
    pattern: /(.*?)うん$/g,
    replacement: '$1', // 去掉句末的"うん"
    description: '去除句末语气词'
  },
  {
    pattern: /(.*?)へん$/g,
    replacement: '$1ない', // ～へん → ～ない
    description: '关西腔否定形正规化'
  },
  {
    pattern: /(.*?)へんかった/g,
    replacement: '$1なかった', // ～へんかった → ～なかった
    description: '关西腔过去否定形正规化'
  },
  {
    pattern: /えっ+/g,
    replacement: '', // 去除"えっ"
    description: '去除语气词'
  },
  {
    pattern: /あのう/g,
    replacement: 'あの', // アナウンス的"あのう"简化
    description: '语气词简化'
  }
];

// 常见片假名单词白名单（不进行罗马音转换）
const COMMON_KATAKANA_WORDS = new Set([
  'センチ', 'メートル', 'キロ', 'グラム', 'ドル', 'ユーロ', 'パーセント',
  'ポイント', 'カード', 'テレビ', 'ラジオ', 'ビデオ', 'カメラ', 'パソコン',
  'スマホ', 'インターネット', 'ウェブ', 'メール', 'ライン', 'ツイッター',
  'フェイスブック', 'インスタグラム', 'ユーチューブ', 'アマゾン', 'グーグル'
]);

// 片假名/OOV处理
const KATAKANA_OOV_PATTERNS: Array<{
  pattern: RegExp;
  minLength: number;
  description: string;
}> = [
  {
    pattern: /[\u30a0-\u30ff]{3,}/g, // 3个以上连续片假名
    minLength: 3,
    description: '长片假名单词检测'
  }
];

// 数字模式和单位
const NUMBER_PATTERN = /\d+/g;
const UNIT_PATTERNS = [
  'センチ', 'cm', 'メートル', 'm', 'キロ', 'kg', 'グラム', 'g',
  '円', 'ドル', 'ユーロ', 'ポイント', 'パーセント', '%', '度', '℃', '℉'
];

/**
 * 检查文本是否包含特定关键词
 */
function containsContextKeywords(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

/**
 * 检查文本是否包含单位关键词
 */
function containsUnitKeywords(text: string): boolean {
  return UNIT_PATTERNS.some(unit => text.includes(unit));
}

/**
 * 数字上下文校验
 * 检查孤立数字是否有单位上下文支持
 */
function validateNumbersWithContext(text: string): {
  isValid: boolean;
  cleanedText: string;
  modifications: string[];
} {
  const modifications: string[] = [];
  let cleanedText = text;

  // 查找所有数字
  const numberMatches = text.match(NUMBER_PATTERN);

  if (numberMatches) {
    // 检查是否有单位上下文
    const hasUnits = containsUnitKeywords(text);

    // 如果没有单位上下文，移除孤立数字
    if (!hasUnits) {
      // 只移除明显的孤立数字（前后没有其他数字或单位）
      const beforeClean = cleanedText;
      cleanedText = cleanedText.replace(/(?:^|\s)\d+(?:\s|$)/g, ' ');
      if (cleanedText !== beforeClean) {
        modifications.push('移除孤立数字');
      }
    }

    // 清理多余的"と"、"で"等连接词
    const beforeConnectiveClean = cleanedText;
    cleanedText = cleanedText.replace(/と\s*うん/g, 'と'); // "とうん" → "と"
    cleanedText = cleanedText.replace(/で\s*うん/g, 'で'); // "でうん" → "で"
    if (cleanedText !== beforeConnectiveClean) {
      modifications.push('清理连接词');
    }
  }

  return {
    isValid: true, // 总是有效的，只是可能清理了内容
    cleanedText: cleanedText.trim(),
    modifications
  };
}

/**
 * 应用同音词替换规则
 */
function applyHomophoneReplacements(text: string): string {
  let normalizedText = text;

  for (const rule of HOMOPHONE_REPLACEMENTS) {
    if (containsContextKeywords(text, rule.contextKeywords)) {
      normalizedText = normalizedText.replace(rule.pattern, rule.replacement);
    }
  }

  return normalizedText;
}

/**
 * 应用口语正规化规则
 */
function applyColloquialNormalizations(text: string): string {
  let normalizedText = text;

  for (const rule of COLLOQUIAL_NORMALIZATIONS) {
    normalizedText = normalizedText.replace(rule.pattern, rule.replacement);
  }

  // 清理多余空格
  normalizedText = normalizedText.replace(/\s+/g, ' ').trim();

  return normalizedText;
}

/**
 * 检测可疑的片假名单词
 */
function detectSuspiciousKatakana(text: string): { word: string; confidence: 'low' | 'medium' | 'high' }[] {
  const suspiciousWords: { word: string; confidence: 'low' | 'medium' | 'high' }[] = [];

  for (const rule of KATAKANA_OOV_PATTERNS) {
    const matches = text.match(rule.pattern);
    if (matches) {
      for (const match of matches) {
        // 检查是否在白名单中
        if (COMMON_KATAKANA_WORDS.has(match)) {
          continue; // 跳过常见词
        }

        // 简单置信度判断：越长越可能是OOV
        const confidence: 'low' | 'medium' | 'high' =
          match.length >= 6 ? 'high' :
          match.length >= 4 ? 'medium' :
          'low';

        suspiciousWords.push({ word: match, confidence });
      }
    }
  }

  return suspiciousWords;
}

/**
 * 片假名转罗马音的简单映射
 */
const KATAKANA_TO_ROMAN: Record<string, string> = {
  'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
  'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
  'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
  'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
  'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
  'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
  'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
  'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
  'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
  'ワ': 'wa', 'ヲ': 'wo', 'ン': 'n',
  'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
  'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
  'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
  'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
  'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
  'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
  'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho',
  'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho',
  'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
  'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
  'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
  'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
  'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo',
  'ウィ': 'wi', 'ウェ': 'we', 'ウォ': 'wo',
  'ヴァ': 'va', 'ヴィ': 'vi', 'ヴ': 'vu', 'ヴェ': 've', 'ヴォ': 'vo',
  'ティ': 'ti', 'トゥ': 'tu', 'ディ': 'di', 'ドゥ': 'du',
  'ファ': 'fa', 'フィ': 'fi', 'フェ': 'fe', 'フォ': 'fo',
  'ッ': '', // 小っつあ
  'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo',
  'ー': '-', // 長音符
};

/**
 * 将片假名单词转换为罗马音
 */
function katakanaToRoman(katakana: string): string {
  let roman = '';
  for (let i = 0; i < katakana.length; i++) {
    const char = katakana[i];
    const nextChar = katakana[i + 1];

    // 处理小っつあ的情况
    if (char === 'ッ' && nextChar) {
      const nextRoman = KATAKANA_TO_ROMAN[nextChar];
      if (nextRoman) {
        roman += nextRoman.charAt(0); // 促音，重复下一个音的第一个字母
        continue;
      }
    }

    // 处理拗音组合
    if ((char === 'ャ' || char === 'ュ' || char === 'ョ') && i > 0) {
      const prevChar = katakana[i - 1];
      const combo = prevChar + char;
      if (KATAKANA_TO_ROMAN[combo]) {
        roman = roman.slice(0, -1) + KATAKANA_TO_ROMAN[combo]; // 替换前一个字符
        continue;
      }
    }

    roman += KATAKANA_TO_ROMAN[char] || char;
  }

  return roman;
}

/**
 * 处理可疑的片假名单词
 */
function handleSuspiciousKatakana(text: string): string {
  const suspiciousWords = detectSuspiciousKatakana(text);

  // 对于低置信度的片假名单词，添加括注提示
  let normalizedText = text;

  for (const { word, confidence } of suspiciousWords) {
    if (confidence === 'low') {
      // 低置信度的片假名添加罗马音提示
      const romanized = katakanaToRoman(word);
      normalizedText = normalizedText.replace(word, `${word}(${romanized})`);
    }
    // 中高置信度的保留原词
  }

  return normalizedText;
}

/**
 * 主归一化函数
 */
export function normalizeJapaneseText(text: string): {
  normalizedText: string;
  modifications: string[];
} {
  const modifications: string[] = [];
  let normalizedText = text;

  // 1. 数字校验和清理
  const numberValidation = validateNumbersWithContext(normalizedText);
  if (numberValidation.modifications.length > 0) {
    modifications.push(...numberValidation.modifications);
    normalizedText = numberValidation.cleanedText;
  }

  // 2. 同音词替换
  const afterHomophone = applyHomophoneReplacements(normalizedText);
  if (afterHomophone !== normalizedText) {
    modifications.push('同音词替换');
    normalizedText = afterHomophone;
  }

  // 3. 口语正规化
  const afterColloquial = applyColloquialNormalizations(normalizedText);
  if (afterColloquial !== normalizedText) {
    modifications.push('口语正规化');
    normalizedText = afterColloquial;
  }

  // 4. 片假名/OOV处理
  const afterKatakana = handleSuspiciousKatakana(normalizedText);
  if (afterKatakana !== normalizedText) {
    modifications.push('片假名处理');
    normalizedText = afterKatakana;
  }

  return {
    normalizedText: normalizedText.trim(),
    modifications
  };
}

export default normalizeJapaneseText;