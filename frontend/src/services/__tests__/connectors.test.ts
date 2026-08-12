import { describe, expect, it } from 'vitest';
import { parseMcpArgs } from '@services/connectors';

describe('parseMcpArgs', () => {
  it('keeps stdio arguments separate instead of producing a shell command', () => {
    expect(parseMcpArgs('--project\r\nD:\\Research\n\n--read-only')).toEqual([
      '--project', 'D:\\Research', '--read-only',
    ]);
  });
});
