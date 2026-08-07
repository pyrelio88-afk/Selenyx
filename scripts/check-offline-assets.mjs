import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expected = Object.freeze([
  ['ocr/tesseract.min.js', 62_961, '10fff78484067759c43028a02a72d76d0b90eb17302bb23b58a9ec5410bc928b'],
  ['ocr/worker.min.js', 111_162, '38645599043239c0eb6db08a6504a92dcdc292200535f3e9339cd77c4443b842'],
  ['ocr/core/tesseract-core.wasm.js', 4_734_777, '2b8c8c92b8788807061fb4bb16c5acdf000c149e100255f879f78d2c58ca9969'],
  ['ocr/core/tesseract-core-simd.wasm.js', 4_735_153, '63f232c4f7a97b04e52eb940202700b2c6239783a75d0ff0553274fac530cd5c'],
  ['ocr/core/tesseract-core-lstm.wasm.js', 3_938_277, '8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa'],
  ['ocr/core/tesseract-core-simd-lstm.wasm.js', 3_938_657, 'ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf'],
  ['ocr/lang/chi_sim.traineddata.gz', 1_718_768, 'b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c'],
  ['ocr/lang/eng.traineddata.gz', 2_952_873, '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91'],
  ['ocr/licenses/tesseract.js-Apache-2.0.txt', 11_357, 'b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1'],
  ['ocr/licenses/tesseract.js-core-Apache-2.0.txt', 11_357, 'b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1'],
  ['ocr/licenses/tessdata-Apache-2.0.txt', 11_357, 'b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1'],
]);

function verify(directory) {
  for (const [relative, expectedSize, expectedHash] of expected) {
    const path = resolve(directory, relative);
    if (!existsSync(path)) throw new Error(`Missing offline OCR asset: ${path}`);
    if (statSync(path).size !== expectedSize) {
      throw new Error(`Unexpected offline OCR asset size: ${path}`);
    }
    const actualHash = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actualHash !== expectedHash) throw new Error(`Unexpected offline OCR asset checksum: ${path}`);
  }
}

verify(resolve(root, 'frontend', 'public'));

if (process.argv.includes('--dist')) {
  verify(resolve(root, 'frontend', 'dist'));
}

console.log(`Offline OCR assets verified (${expected.length} files${process.argv.includes('--dist') ? ', source + dist' : ''}).`);
