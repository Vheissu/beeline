import { jest } from '@jest/globals';

export const fsExtraMock = {
  ensureDir: jest.fn().mockResolvedValue(undefined),
  pathExists: jest.fn().mockResolvedValue(true),
  readJson: jest.fn().mockResolvedValue({
    accounts: {},
    encryptionEnabled: true
  }),
  writeJson: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined)
};

export const mockFsExtra = (customMock?: Partial<typeof fsExtraMock>) => {
  return {
    ...fsExtraMock,
    ...customMock
  };
};