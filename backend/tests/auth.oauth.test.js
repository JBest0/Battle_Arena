const crypto = require('crypto');
const { OauthService, cleanGithubUsername } = require('../src/modules/auth/oauth/oauth.service');
const { OauthController } = require('../src/modules/auth/oauth/oauth.controller');

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    username: 'octo_user',
    email: 'octo@example.com',
    emailVerified: true,
    avatarId: 'avatar-1',
    avatar: { id: 'avatar-1', url: '/static/avatars/1.png' },
    createdAt: new Date(),
    ...overrides,
  };
}

function makeHarness(profileOverrides = {}) {
  const profile = {
    providerUserId: '123',
    login: 'Octo-User',
    email: 'octo@example.com',
    ...profileOverrides,
  };
  const provider = {
    getAuthUrl: jest.fn((state) => `https://github.test/authorize?state=${state}`),
    getProfile: jest.fn().mockResolvedValue(profile),
  };

  let userByEmail = null;
  let identity = null;
  let created = null;

  const userRepository = {
    findByEmail: jest.fn(async () => userByEmail),
    findByUsername: jest.fn(async (username) => (created?.username === username ? created : null)),
    findByIdWithAvatar: jest.fn(async (id) => created || makeUser({ id })),
    touchLastLogin: jest.fn(async () => {}),
    toPublicUser: jest.fn((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      avatarId: user.avatarId,
      avatarUrl: user.avatar?.url || null,
      createdAt: user.createdAt,
    })),
  };

  const externalIdentityRepository = {
    find: jest.fn(async () => identity),
    create: jest.fn(async (data) => {
      identity = { ...data, user: created };
      return identity;
    }),
  };

  const authService = {
    createUserWithDefaults: jest.fn(async (data) => {
      created = makeUser({
        username: data.username,
        email: data.email,
        emailVerified: data.emailVerified,
      });
      return created;
    }),
  };

  const unitOfWork = {
    run: jest.fn(async (work) => work({})),
  };

  const service = new OauthService({
    provider,
    externalIdentityRepository,
    userRepository,
    unitOfWork,
    authService,
  });

  return {
    service,
    provider,
    userRepository,
    externalIdentityRepository,
    authService,
    setUserByEmail(value) {
      userByEmail = value;
    },
    setIdentity(value) {
      identity = value;
    },
  };
}

describe('GitHub OAuth account linking', () => {
  it('creates a new social user with verified email and no password', async () => {
    const harness = makeHarness();
    const result = await harness.service.loginWithCode('code');

    expect(result.user.emailVerified).toBe(true);
    expect(harness.authService.createUserWithDefaults).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: null,
        emailVerified: true,
        email: 'octo@example.com',
      }),
      expect.anything()
    );
    expect(harness.externalIdentityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github', providerUserId: '123' }),
      expect.anything()
    );
  });

  it('logs in an existing external identity', async () => {
    const harness = makeHarness();
    const existing = makeUser();
    harness.setIdentity({ userId: existing.id, user: existing });

    const result = await harness.service.loginWithCode('code');

    expect(result.user.id).toBe(existing.id);
    expect(harness.authService.createUserWithDefaults).not.toHaveBeenCalled();
  });

  it('links by verified email without creating a duplicate user', async () => {
    const harness = makeHarness();
    const existing = makeUser({ id: 'existing-user' });
    harness.setUserByEmail(existing);

    const result = await harness.service.loginWithCode('code');

    expect(result.user.id).toBe('existing-user');
    expect(harness.authService.createUserWithDefaults).not.toHaveBeenCalled();
    expect(harness.externalIdentityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'existing-user' }),
      expect.anything()
    );
  });

  it('rejects an account when GitHub has no verified email', async () => {
    const harness = makeHarness({ email: null });

    await expect(harness.service.loginWithCode('code')).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('propagates provider failures without creating a session', async () => {
    const harness = makeHarness();
    harness.provider.getProfile.mockRejectedValue(new Error('provider down'));

    await expect(harness.service.loginWithCode('code')).rejects.toThrow(
      'provider down'
    );
    expect(harness.authService.createUserWithDefaults).not.toHaveBeenCalled();
  });

  it('cleans GitHub usernames and keeps the allowed length', () => {
    expect(cleanGithubUsername('Octo-User')).toBe('Octo_User');
    expect(cleanGithubUsername('ab')).toMatch(/^github_/);
    expect(cleanGithubUsername('a'.repeat(40))).toHaveLength(30);
  });
});

describe('GitHub OAuth callback state', () => {
  const config = {
    frontendUrl: 'http://localhost:5173',
    nodeEnv: 'test',
  };

  function responseMock() {
    return {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(function (url) {
        this.url = url;
        return this;
      }),
    };
  }

  it('returns access_denied as a login OAuth error', () => {
    const oauthService = { createState: jest.fn(), getAuthUrl: jest.fn() };
    const controller = new OauthController({ oauthService, config });
    const res = responseMock();

    controller.githubCallback(
      { query: { error: 'access_denied' }, headers: {} },
      res
    );

    expect(res.url).toBe(
      'http://localhost:5173/login?oauthError=ACCESS_DENIED'
    );
  });

  it('rejects an invalid state', async () => {
    const oauthService = { createState: jest.fn(), loginWithCode: jest.fn() };
    const controller = new OauthController({ oauthService, config });
    const res = responseMock();

    await controller.githubCallback(
      {
        query: { code: 'code', state: 'wrong' },
        headers: { cookie: `oauth_state=${crypto.randomBytes(16).toString('hex')}` },
      },
      res
    );

    expect(res.url).toBe(
      'http://localhost:5173/login?oauthError=STATE_INVALID'
    );
  });
});
