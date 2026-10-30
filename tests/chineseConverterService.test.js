import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toTraditionalChinese } from '../src/server/services/chineseConverterService.js';

describe('J.A.R.V.I.S. Chinese Converter Service (s2t)', () => {
  it('converts common simplified characters to traditional characters accurately', () => {
    assert.equal(toTraditionalChinese('图'), '圖');
    assert.equal(toTraditionalChinese('现'), '現');
    assert.equal(toTraditionalChinese('卫'), '衛');
    assert.equal(toTraditionalChinese('环'), '環');
    assert.equal(toTraditionalChinese('轨'), '軌');
    assert.equal(toTraditionalChinese('显'), '顯');
    assert.equal(toTraditionalChinese('当'), '當');
    assert.equal(toTraditionalChinese('实'), '實');
    assert.equal(toTraditionalChinese('拟'), '擬');
  });

  it('converts full sentences from simplified to traditional Chinese while keeping English and punctuation intact', () => {
    const input =
      '全息图现在展示了太阳系，包括太阳、八大行星及其卫星、矮行星、小行星和彗星，按照真实的比例和轨道运行。您可以使用语音指令来控制模拟，例如：“JARVIS，显示火星当前的温度”或“JARVIS，放大土星的环”。 是否需要执行其他任务，Sir？';
    const expected =
      '全息圖現在展示了太陽系，包括太陽、八大行星及其衛星、矮行星、小行星和彗星，按照真實的比例和軌道運行。您可以使用語音指令來控制模擬，例如：“JARVIS，顯示火星當前的溫度”或“JARVIS，放大土星的環”。 是否需要執行其他任務，Sir？';

    assert.equal(toTraditionalChinese(input), expected);
  });

  it('safely handles empty, null, or non-string inputs without throwing', () => {
    assert.equal(toTraditionalChinese(''), '');
    assert.equal(toTraditionalChinese(null), '');
    assert.equal(toTraditionalChinese(undefined), '');
    assert.equal(toTraditionalChinese('Hello World 123!'), 'Hello World 123!');
  });
});
