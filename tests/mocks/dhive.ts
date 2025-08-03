import { jest } from '@jest/globals';

export const mockPrivateKey = {
  toString: jest.fn().mockReturnValue(global.TEST_PRIVATE_KEY),
  createPublic: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue(global.TEST_PUBLIC_KEY)
  })
};

export const mockClient = {
  database: {
    getAccounts: jest.fn().mockResolvedValue([{
      name: 'testuser',
      balance: '1000.000 HIVE',
      hbd_balance: '100.000 HBD',
      vesting_shares: '5000000.000000 VESTS',
      savings_balance: '50.000 HIVE',
      savings_hbd_balance: '25.000 HBD',
      delegated_vesting_shares: '0.000000 VESTS',
      received_vesting_shares: '1000000.000000 VESTS'
    }]),
    getDynamicGlobalProperties: jest.fn().mockResolvedValue({
      total_vesting_shares: '100000000000.000000 VESTS',
      total_vesting_fund_hive: '50000000.000 HIVE',
      head_block_number: 75000000
    }),
    getConfig: jest.fn().mockResolvedValue({
      HIVE_BLOCKCHAIN_VERSION: '1.26.4'
    })
  },
  broadcast: {
    sendOperations: jest.fn().mockResolvedValue({
      id: 'mock-transaction-id'
    })
  },
  rc: {
    findRCAccounts: jest.fn().mockResolvedValue([{
      rc_manabar: {
        current_mana: '5000000000000'
      },
      max_rc: '10000000000000'
    }])
  },
  address: 'https://api.hive.blog'
};

export const mockDHive = {
  Client: jest.fn().mockImplementation(() => mockClient),
  PrivateKey: {
    fromString: jest.fn().mockReturnValue(mockPrivateKey),
    fromLogin: jest.fn().mockReturnValue(mockPrivateKey)
  },
  cryptoUtils: {},
  Asset: {
    from: jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue('1.000 HIVE')
    })
  }
};