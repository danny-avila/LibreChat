"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parse = require("./parse");
describe('parse', () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    describe('getLines', () => {
        it('single line', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual('id: abc');
                expect(fieldLength).toEqual(2);
            });
            next(encoder.encode('id: abc\n'));
            expect(lineNum).toBe(1);
        });
        it('multiple lines', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual(lineNum === 1 ? 'id: abc' : 'data: def');
                expect(fieldLength).toEqual(lineNum === 1 ? 2 : 4);
            });
            next(encoder.encode('id: abc\n'));
            next(encoder.encode('data: def\n'));
            expect(lineNum).toBe(2);
        });
        it('single line split across multiple arrays', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual('id: abc');
                expect(fieldLength).toEqual(2);
            });
            next(encoder.encode('id: a'));
            next(encoder.encode('bc\n'));
            expect(lineNum).toBe(1);
        });
        it('multiple lines split across multiple arrays', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual(lineNum === 1 ? 'id: abc' : 'data: def');
                expect(fieldLength).toEqual(lineNum === 1 ? 2 : 4);
            });
            next(encoder.encode('id: ab'));
            next(encoder.encode('c\nda'));
            next(encoder.encode('ta: def\n'));
            expect(lineNum).toBe(2);
        });
        it('new line', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual('');
                expect(fieldLength).toEqual(-1);
            });
            next(encoder.encode('\n'));
            expect(lineNum).toBe(1);
        });
        it('comment line', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual(': this is a comment');
                expect(fieldLength).toEqual(0);
            });
            next(encoder.encode(': this is a comment\n'));
            expect(lineNum).toBe(1);
        });
        it('line with no field', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual('this is an invalid line');
                expect(fieldLength).toEqual(-1);
            });
            next(encoder.encode('this is an invalid line\n'));
            expect(lineNum).toBe(1);
        });
        it('line with multiple colons', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual('id: abc: def');
                expect(fieldLength).toEqual(2);
            });
            next(encoder.encode('id: abc: def\n'));
            expect(lineNum).toBe(1);
        });
        it('single byte array with multiple lines separated by \\n', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual(lineNum === 1 ? 'id: abc' : 'data: def');
                expect(fieldLength).toEqual(lineNum === 1 ? 2 : 4);
            });
            next(encoder.encode('id: abc\ndata: def\n'));
            expect(lineNum).toBe(2);
        });
        it('single byte array with multiple lines separated by \\r', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual(lineNum === 1 ? 'id: abc' : 'data: def');
                expect(fieldLength).toEqual(lineNum === 1 ? 2 : 4);
            });
            next(encoder.encode('id: abc\rdata: def\r'));
            expect(lineNum).toBe(2);
        });
        it('single byte array with multiple lines separated by \\r\\n', () => {
            let lineNum = 0;
            const next = parse.getLines((line, fieldLength) => {
                ++lineNum;
                expect(decoder.decode(line)).toEqual(lineNum === 1 ? 'id: abc' : 'data: def');
                expect(fieldLength).toEqual(lineNum === 1 ? 2 : 4);
            });
            next(encoder.encode('id: abc\r\ndata: def\r\n'));
            expect(lineNum).toBe(2);
        });
    });
    describe('getMessages', () => {
        it('happy path', () => {
            let msgNum = 0;
            const next = parse.getMessages(id => {
                expect(id).toEqual('abc');
            }, retry => {
                expect(retry).toEqual(42);
            }, msg => {
                ++msgNum;
                expect(msg).toEqual({
                    retry: 42,
                    id: 'abc',
                    event: 'def',
                    data: 'ghi'
                });
            });
            next(encoder.encode('retry: 42'), 5);
            next(encoder.encode('id: abc'), 2);
            next(encoder.encode('event:def'), 5);
            next(encoder.encode('data:ghi'), 4);
            next(encoder.encode(''), -1);
            expect(msgNum).toBe(1);
        });
        it('skip unknown fields', () => {
            let msgNum = 0;
            const next = parse.getMessages(id => {
                expect(id).toEqual('abc');
            }, _retry => {
                fail('retry should not be called');
            }, msg => {
                ++msgNum;
                expect(msg).toEqual({
                    id: 'abc',
                    data: '',
                    event: '',
                    retry: undefined,
                });
            });
            next(encoder.encode('id: abc'), 2);
            next(encoder.encode('foo: null'), 3);
            next(encoder.encode(''), -1);
            expect(msgNum).toBe(1);
        });
        it('ignore non-integer retry', () => {
            let msgNum = 0;
            const next = parse.getMessages(_id => {
                fail('id should not be called');
            }, _retry => {
                fail('retry should not be called');
            }, msg => {
                ++msgNum;
                expect(msg).toEqual({
                    id: '',
                    data: '',
                    event: '',
                    retry: undefined,
                });
            });
            next(encoder.encode('retry: def'), 5);
            next(encoder.encode(''), -1);
            expect(msgNum).toBe(1);
        });
        it('skip comment-only messages', () => {
            let msgNum = 0;
            const next = parse.getMessages(id => {
                expect(id).toEqual('123');
            }, _retry => {
                fail('retry should not be called');
            }, msg => {
                ++msgNum;
                expect(msg).toEqual({
                    retry: undefined,
                    id: '123',
                    event: 'foo ',
                    data: '',
                });
            });
            next(encoder.encode('id:123'), 2);
            next(encoder.encode(':'), 0);
            next(encoder.encode(':    '), 0);
            next(encoder.encode('event: foo '), 5);
            next(encoder.encode(''), -1);
            expect(msgNum).toBe(1);
        });
        it('should append data split across multiple lines', () => {
            let msgNum = 0;
            const next = parse.getMessages(_id => {
                fail('id should not be called');
            }, _retry => {
                fail('retry should not be called');
            }, msg => {
                ++msgNum;
                expect(msg).toEqual({
                    data: 'YHOO\n+2\n\n10',
                    id: '',
                    event: '',
                    retry: undefined,
                });
            });
            next(encoder.encode('data:YHOO'), 4);
            next(encoder.encode('data: +2'), 4);
            next(encoder.encode('data'), 4);
            next(encoder.encode('data: 10'), 4);
            next(encoder.encode(''), -1);
            expect(msgNum).toBe(1);
        });
        it('should reset id if sent multiple times', () => {
            const expectedIds = ['foo', ''];
            let idsIdx = 0;
            let msgNum = 0;
            const next = parse.getMessages(id => {
                expect(id).toEqual(expectedIds[idsIdx]);
                ++idsIdx;
            }, _retry => {
                fail('retry should not be called');
            }, msg => {
                ++msgNum;
                expect(msg).toEqual({
                    data: '',
                    id: '',
                    event: '',
                    retry: undefined,
                });
            });
            next(encoder.encode('id: foo'), 2);
            next(encoder.encode('id'), 2);
            next(encoder.encode(''), -1);
            expect(idsIdx).toBe(2);
            expect(msgNum).toBe(1);
        });
    });
});
//# sourceMappingURL=parse.spec.js.map