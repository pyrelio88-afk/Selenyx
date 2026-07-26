// General Canon — 通用领域插件。
// 不扩展任何类型：只用核心 8 类 atom / 9 类 relation。适合开放探索。
import { BaseCanon, ConfidenceOntology } from '../core/canon.js';

export class GeneralCanon extends BaseCanon {
  constructor() {
    super({
      name: 'general',
      atomTypes: [],
      relationTypes: [],
      confidenceOntology: new ConfidenceOntology('generic', {
        high: 0.9,
        medium: 0.7,
        low: 0.4,
        speculative: 0.2,
      }),
    });
  }
}
