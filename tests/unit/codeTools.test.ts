import { describe, it, expect } from 'vitest';
import { tokenize, diffLines, hunks, diffStats, applyDiff, findAll, hashText } from '../../src/engine/codeTools';

describe('highlighter', () => {
	it('classifies keywords, strings, numbers, comments, calls and types', () => {
		const [t] = tokenize(['const x = foo(1.5e3, "a\\"b") // hi']);
		const kinds = t.map((k) => k.k);
		expect(kinds[0]).toBe('kw');
		expect(t.find((k) => k.k === 'fn')).toMatchObject({ s: 10, e: 13 });
		expect(t.find((k) => k.k === 'num')).toMatchObject({ s: 14, e: 19 });
		expect(t.find((k) => k.k === 'str')).toMatchObject({ s: 21, e: 27 });
		expect(t.at(-1)).toMatchObject({ k: 'com', e: 34 });
	});
	it('carries block comments and template strings across lines', () => {
		const t = tokenize(['a /* start', 'still comment', 'end */ b', 'let s = `x', 'y` + 1']);
		expect(t[1]).toEqual([{ s: 0, e: 13, k: 'com' }]);
		expect(t[2][0]).toMatchObject({ k: 'com', e: 6 });
		expect(t[2][1]).toMatchObject({ k: 'plain' });
		expect(t[4][0]).toMatchObject({ k: 'str', s: 0, e: 2 });
		expect(t[4].at(-1)).toMatchObject({ k: 'num' });
	});
});

describe('diff', () => {
	it('finds inserted, removed and changed lines and round-trips', () => {
		const a = 'one\ntwo\nthree\nfour\nfive';
		const b = 'one\n2\nthree\nfour\nfive\nsix';
		const d = diffLines(a, b);
		expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
		expect(applyDiff(d)).toBe(b);
		expect(d.filter((l) => l.k === '-').map((l) => l.text)).toEqual(['two']);
		const h = hunks(diffLines(Array.from({ length: 40 }, (_, i) => 'l' + i).join('\n'), Array.from({ length: 40 }, (_, i) => (i === 3 || i === 30 ? 'X' : 'l' + i)).join('\n')), 2);
		expect(h.filter((x) => x === null).length).toBe(1); // two separate hunks
	});
	it('identical text has no changes', () => {
		expect(diffStats(diffLines('a\nb', 'a\nb'))).toEqual({ added: 0, removed: 0 });
	});
});

describe('search + hash', () => {
	it('finds every match, case-insensitively by default', () => {
		expect(findAll(['Foo foo', 'bar FOO'], 'foo')).toHaveLength(3);
		expect(findAll(['Foo foo'], 'foo', true)).toEqual([{ line: 0, col: 4, len: 3 }]);
	});
	it('hash changes with content', () => {
		expect(hashText('abc')).toBe(hashText('abc'));
		expect(hashText('abc')).not.toBe(hashText('abd'));
	});
});
