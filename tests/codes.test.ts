import { describe, expect, it } from 'vitest';
import {
  appendToDraft,
  codesFromFile,
  extractCandidates,
  hashCode,
  maskCode,
  parseCodes,
} from '@/lib/codes';

const FORMAT = /^[A-Za-z0-9]{6,32}$/;

describe('parseCodes', () => {
  it('splits on newlines, spaces, commas and semicolons', () => {
    const result = parseCodes('AAAAAA1\nBBBBBB2, CCCCCC3;DDDDDD4  EEEEEE5', FORMAT);
    expect(result.valid).toEqual(['AAAAAA1', 'BBBBBB2', 'CCCCCC3', 'DDDDDD4', 'EEEEEE5']);
  });

  it('separates duplicates and invalid codes', () => {
    const result = parseCodes('AAAAAA1\nAAAAAA1\nbad!\n', FORMAT);
    expect(result.valid).toEqual(['AAAAAA1']);
    expect(result.duplicates).toEqual(['AAAAAA1']);
    expect(result.invalid).toEqual(['bad!']);
  });

  it('moves codes beyond the batch limit to overLimit', () => {
    const result = parseCodes('AAAAAA1 BBBBBB2 CCCCCC3', FORMAT, 2);
    expect(result.valid).toHaveLength(2);
    expect(result.overLimit).toEqual(['CCCCCC3']);
  });
});

describe('maskCode', () => {
  it('keeps only the edges of long codes', () => {
    expect(maskCode('ABCD1234EFGH')).toBe('ABCD****EFGH');
  });

  it('hides short codes almost entirely', () => {
    expect(maskCode('ABCDEF')).toBe('AB****');
  });
});

describe('hashCode', () => {
  it('returns a stable SHA 256 hex digest', async () => {
    const hash = await hashCode('ABC');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(await hashCode('ABC'));
  });
});

describe('extractCandidates', () => {
  it('keeps code like tokens from a social post and drops plain words', () => {
    const post =
      'Code Delta Force mới: DFVNHackclaw1, AUGTUTO và TrickOrTreat! Nhập tại trang redeem.';
    expect(extractCandidates(post, FORMAT)).toEqual(['DFVNHackclaw1', 'AUGTUTO', 'TrickOrTreat']);
  });

  it('dedupes repeated codes', () => {
    expect(extractCandidates('ABC12345 ABC12345', FORMAT)).toEqual(['ABC12345']);
  });
});

describe('codesFromFile', () => {
  it('keeps plain text as is', () => {
    expect(codesFromFile('AAA\nBBB')).toBe('AAA\nBBB');
  });

  it('takes only the code column from an exported CSV', () => {
    const csv = '﻿code,status,message\nAAA111,used,error_hint_400067\nBBB222,pending,';
    expect(codesFromFile(csv)).toBe('AAA111\nBBB222');
  });
});

describe('appendToDraft', () => {
  it('appends only codes that are not already in the draft', () => {
    expect(appendToDraft('AAA111\nBBB222', ['BBB222', 'CCC333'])).toBe('AAA111\nBBB222\nCCC333');
  });

  it('works on an empty draft', () => {
    expect(appendToDraft('', ['AAA111'])).toBe('AAA111');
  });
});
