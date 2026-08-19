const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

jest.mock('axios');
jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(({ message }) => message),
  generateShortLivedToken: jest.fn(() => 'jwt-token'),
}));

const { deleteVectors } = require('./crud');

const RAG_API_URL = 'http://rag.test';
const AGENT = 'agent-abc';

const req = { user: { id: 'user-1' } };
const entityOwnedFile = { file_id: 'file-agent', embedded: true, entity_id: AGENT };
const userOwnedFile = { file_id: 'file-user', embedded: true };

/** The shape rag_api answers when a delete's scope matched nothing. */
const httpError = (status) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { detail: 'One or more IDs not found' } },
  });

/** Connection refused: no response at all, so nothing proves the chunks went. */
const transportError = () => Object.assign(new Error('connect ECONNREFUSED'), { request: {} });

describe('deleteVectors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAG_API_URL = RAG_API_URL;
    axios.delete.mockResolvedValue({ status: 200, data: {} });
  });

  afterEach(() => {
    delete process.env.RAG_API_URL;
  });

  const requestConfig = () => axios.delete.mock.calls[0][1];

  describe('the entity scope the delete carries', () => {
    test('sends the file row"s entity as the entity_id query parameter', async () => {
      await deleteVectors(req, entityOwnedFile);

      expect(axios.delete).toHaveBeenCalledWith(`${RAG_API_URL}/documents`, expect.any(Object));
      expect(requestConfig().params).toEqual({ entity_id: AGENT });
    });

    test('sends no entity_id at all for a file that records no owning entity', async () => {
      await deleteVectors(req, userOwnedFile);

      expect(requestConfig().params).toBeUndefined();
    });

    test('carries the entity in the query string, leaving the request body the bare id array', async () => {
      /* Invariant 7: an older rag_api ignores an unrecognised query parameter,
       * so a new client stays inert against it. A body change would not. */
      await deleteVectors(req, entityOwnedFile);

      expect(requestConfig().data).toEqual([entityOwnedFile.file_id]);
    });

    test('leaves a non-entity delete byte-identical to the request sent before this change', async () => {
      await deleteVectors(req, userOwnedFile);

      expect(axios.delete).toHaveBeenCalledWith(`${RAG_API_URL}/documents`, {
        headers: {
          Authorization: 'Bearer jwt-token',
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        data: [userOwnedFile.file_id],
      });
    });
  });

  describe('what counts as a successful delete', () => {
    test('rejects when an entity-scoped delete answers 404, because the chunks are still there', async () => {
      axios.delete.mockRejectedValue(httpError(404));

      await expect(deleteVectors(req, entityOwnedFile)).rejects.toThrow();
    });

    test('rejects when an entity-scoped delete never reaches the service', async () => {
      axios.delete.mockRejectedValue(transportError());

      await expect(deleteVectors(req, entityOwnedFile)).rejects.toThrow();
    });

    test('still tolerates a 404 for a file that records no owning entity', async () => {
      axios.delete.mockRejectedValue(httpError(404));

      await expect(deleteVectors(req, userOwnedFile)).resolves.toBeUndefined();
    });

    test('still tolerates a transport failure for a file that records no owning entity', async () => {
      axios.delete.mockRejectedValue(transportError());

      await expect(deleteVectors(req, userOwnedFile)).resolves.toBeUndefined();
    });

    test('still rejects a 500 for a file that records no owning entity', async () => {
      axios.delete.mockRejectedValue(httpError(500));

      await expect(deleteVectors(req, userOwnedFile)).rejects.toThrow();
    });

    test('names the file and its entity scope in the log before it throws', async () => {
      /* The bug was invisible for as long as the failure was silent. */
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      axios.delete.mockRejectedValue(httpError(404));

      await expect(deleteVectors(req, entityOwnedFile)).rejects.toThrow();

      const logged = warn.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logged).toContain(entityOwnedFile.file_id);
      expect(logged).toContain(AGENT);
      warn.mockRestore();
    });
  });

  describe('when there is nothing embedded to delete', () => {
    test('makes no request for a file that was never embedded', async () => {
      await deleteVectors(req, { file_id: 'file-plain', embedded: false, entity_id: AGENT });

      expect(axios.delete).not.toHaveBeenCalled();
    });

    test('makes no request when no vector service is configured', async () => {
      delete process.env.RAG_API_URL;

      await deleteVectors(req, entityOwnedFile);

      expect(axios.delete).not.toHaveBeenCalled();
    });
  });
});
