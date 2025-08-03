/**
 * Test fixtures and mock data for Beeline CLI tests
 */

export const TEST_ACCOUNTS = {
  primary: 'testuser',
  secondary: 'seconduser',
  business: 'businessuser',
  nonexistent: 'nonexistentuser'
} as const;

export const TEST_CREDENTIALS = {
  password: 'testpassword123',
  weakPassword: '123',
  pin: '1234',
  shortPin: '12',
  longPin: '123456789'
} as const;

export const TEST_KEYS = {
  private: '5JTest123PrivateKeyExample',
  public: 'STMTest123PublicKeyExample',
  invalidPrivate: 'invalid-private-key',
  invalidPublic: 'invalid-public-key'
} as const;

export const MOCK_ACCOUNT_DATA = {
  basic: {
    name: TEST_ACCOUNTS.primary,
    balance: '1000.000 HIVE',
    hbd_balance: '100.000 HBD',
    vesting_shares: '5000000.000000 VESTS',
    savings_balance: '50.000 HIVE',
    savings_hbd_balance: '25.000 HBD',
    delegated_vesting_shares: '0.000000 VESTS',
    received_vesting_shares: '1000000.000000 VESTS'
  },
  wealthy: {
    name: TEST_ACCOUNTS.business,
    balance: '1000000.000 HIVE',
    hbd_balance: '100000.000 HBD',
    vesting_shares: '50000000.000000 VESTS',
    savings_balance: '500000.000 HIVE',
    savings_hbd_balance: '250000.000 HBD',
    delegated_vesting_shares: '5000000.000000 VESTS',
    received_vesting_shares: '10000000.000000 VESTS'
  },
  empty: {
    name: TEST_ACCOUNTS.secondary,
    balance: '0.000 HIVE',
    hbd_balance: '0.000 HBD',
    vesting_shares: '0.000000 VESTS',
    savings_balance: '0.000 HIVE',
    savings_hbd_balance: '0.000 HBD',
    delegated_vesting_shares: '0.000000 VESTS',
    received_vesting_shares: '0.000000 VESTS'
  }
} as const;

export const MOCK_BALANCES = {
  basic: {
    hive: '1000.000',
    hbd: '100.000',
    hp: '300.000',
    savings_hive: '50.000',
    savings_hbd: '25.000'
  },
  wealthy: {
    hive: '1000000.000',
    hbd: '100000.000',
    hp: '275000.000',
    savings_hive: '500000.000',
    savings_hbd: '250000.000'
  },
  empty: {
    hive: '0.000',
    hbd: '0.000',
    hp: '0.000',
    savings_hive: '0.000',
    savings_hbd: '0.000'
  }
} as const;

export const MOCK_GLOBAL_PROPS = {
  default: {
    total_vesting_shares: '100000000000.000000 VESTS',
    total_vesting_fund_hive: '50000000.000 HIVE',
    head_block_number: 75000000
  },
  updated: {
    total_vesting_shares: '150000000000.000000 VESTS',
    total_vesting_fund_hive: '75000000.000 HIVE',
    head_block_number: 76000000
  }
} as const;

export const MOCK_NODE_INFO = {
  primary: {
    url: 'https://api.hive.blog',
    version: '1.26.4',
    lastBlockNum: 75000000
  },
  secondary: {
    url: 'https://hived.emre.sh',
    version: '1.26.3',
    lastBlockNum: 74999999
  },
  custom: {
    url: 'https://custom.hive.node',
    version: '1.27.0',
    lastBlockNum: 75500000
  }
} as const;

export const MOCK_RC_DATA = {
  full: {
    rc_manabar: { current_mana: '10000000000000' },
    max_rc: '10000000000000'
  },
  half: {
    rc_manabar: { current_mana: '5000000000000' },
    max_rc: '10000000000000'
  },
  low: {
    rc_manabar: { current_mana: '1000000000000' },
    max_rc: '10000000000000'
  },
  empty: {
    rc_manabar: { current_mana: '0' },
    max_rc: '10000000000000'
  }
} as const;

export const MOCK_TRANSACTIONS = {
  transfer: {
    id: 'mock-transfer-transaction-id-12345',
    from: TEST_ACCOUNTS.primary,
    to: TEST_ACCOUNTS.secondary,
    amount: '10.000 HIVE',
    memo: 'Test transfer'
  },
  powerup: {
    id: 'mock-powerup-transaction-id-67890',
    from: TEST_ACCOUNTS.primary,
    to: TEST_ACCOUNTS.primary,
    amount: '100.000 HIVE'
  }
} as const;

export const MOCK_ERRORS = {
  network: new Error('Network timeout'),
  invalidAccount: new Error('Account not found'),
  insufficientFunds: new Error('Insufficient funds'),
  invalidKey: new Error('Invalid private key'),
  invalidPin: new Error('Invalid PIN'),
  authFailed: new Error('Authentication failed'),
  apiError: new Error('API rate limit exceeded')
} as const;

export const CLI_FLAGS = {
  login: {
    minimal: { roles: 'posting', pin: false, verify: false, force: false },
    secure: { roles: 'posting,active,memo', pin: true, verify: true, force: false },
    forced: { roles: 'posting', pin: false, verify: false, force: true }
  },
  balance: {
    table: { format: 'table', mock: false },
    json: { format: 'json', mock: false },
    mock: { format: 'table', mock: true },
    customNode: { format: 'table', mock: false, node: 'https://custom.node' }
  }
} as const;

export const WALLET_CONFIGS = {
  empty: {
    accounts: {},
    encryptionEnabled: true
  },
  singleAccount: {
    accounts: {
      [TEST_ACCOUNTS.primary]: [{
        account: TEST_ACCOUNTS.primary,
        role: 'posting' as const,
        publicKey: TEST_KEYS.public,
        encrypted: true
      }]
    },
    defaultAccount: TEST_ACCOUNTS.primary,
    encryptionEnabled: true
  },
  multipleAccounts: {
    accounts: {
      [TEST_ACCOUNTS.primary]: [
        {
          account: TEST_ACCOUNTS.primary,
          role: 'posting' as const,
          publicKey: TEST_KEYS.public,
          encrypted: true
        },
        {
          account: TEST_ACCOUNTS.primary,
          role: 'active' as const,
          publicKey: TEST_KEYS.public,
          encrypted: true
        }
      ],
      [TEST_ACCOUNTS.secondary]: [{
        account: TEST_ACCOUNTS.secondary,
        role: 'posting' as const,
        publicKey: TEST_KEYS.public,
        encrypted: false
      }]
    },
    defaultAccount: TEST_ACCOUNTS.primary,
    encryptionEnabled: true
  }
} as const;