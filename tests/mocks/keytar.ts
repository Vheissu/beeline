import { jest } from '@jest/globals';

export const keytarMock = {
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue(null),
  deletePassword: jest.fn().mockResolvedValue(true)
};

export const mockKeytarService = (customMock?: Partial<typeof keytarMock>) => {
  return {
    ...keytarMock,
    ...customMock
  };
};