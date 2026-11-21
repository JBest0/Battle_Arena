class ExternalIdentityRepository {
  constructor(db) {
    this.db = db;
  }

  find(provider, providerUserId, tx = this.db) {
    return tx.externalIdentity.findUnique({
      where: {
        provider_providerUserId: { provider, providerUserId },
      },
      include: { user: { include: { avatar: true } } },
    });
  }

  create({ userId, provider, providerUserId }, tx = this.db) {
    return tx.externalIdentity.create({
      data: { userId, provider, providerUserId },
    });
  }
}

module.exports = { ExternalIdentityRepository };
