import { getSafeErrorMetadata } from './errors';

describe('getSafeErrorMetadata', () => {
  it('keeps bounded diagnostic fields without serializing raw provider data', () => {
    const rawValue = 'PRIVATE-SUBMITTED-CONTENT';
    const error = Object.assign(new Error(`Provider echoed ${rawValue}`), {
      code: 'ERR_REMOTE',
      response: {
        status: 422,
        headers: { authorization: rawValue },
        data: { prompt: rawValue },
      },
    });

    const metadata = getSafeErrorMetadata(error);

    expect(metadata).toEqual({
      type: 'Error',
      status: 422,
    });
    expect(JSON.stringify(metadata)).not.toContain(rawValue);
  });

  it('drops attacker-controlled names and codes', () => {
    const rawValue = 'private value with spaces';
    const error = {
      name: rawValue,
      code: rawValue,
      status: '400',
      message: rawValue,
    };

    expect(getSafeErrorMetadata(error)).toEqual({ type: 'UnknownError' });
  });

  it('does not trust syntactically valid error identifiers or numeric codes', () => {
    const rawValue = 'Account123456789';

    expect(
      getSafeErrorMetadata({
        name: rawValue,
        code: rawValue,
        message: rawValue,
      }),
    ).toEqual({ type: 'UnknownError' });
    expect(
      getSafeErrorMetadata({
        code: 123456789,
        message: rawValue,
      }),
    ).toEqual({ type: 'UnknownError' });
  });
});
