import test from 'node:test';
import assert from 'node:assert/strict';
import { outranks } from '../server/services/enrichService.js';

test('元数据优先级：手动 > Bangumi > 弹弹Play > 内置目录', () => {
  // 用户定下的规则：手动锁定 > Bangumi > 弹弹play
  assert.equal(outranks('manual', 'bangumi'), true, '手动改的，Bangumi 不能盖');
  assert.equal(outranks('bangumi', 'manual'), false);
  assert.equal(outranks('bangumi', 'dandanplay'), true, 'Bangumi 应该能盖掉弹弹Play 的');
  assert.equal(outranks('dandanplay', 'bangumi'), false);
  assert.equal(outranks('bangumi', 'bilibili'), true, 'Bangumi 也能盖掉内置目录的');
  assert.equal(outranks('bilibili', 'bangumi'), false);
});

test('元数据优先级：同级不会互相覆盖', () => {
  assert.equal(outranks('bangumi', 'bangumi'), false);
  assert.equal(outranks('dandanplay', 'dandanplay'), false);
});

test('元数据优先级：未知来源排在最低', () => {
  assert.equal(outranks('bangumi', 'unknown_source'), true);
  assert.equal(outranks('unknown_source', 'bangumi'), false);
  assert.equal(outranks('unknown_source', 'dandanplay'), false);
});
