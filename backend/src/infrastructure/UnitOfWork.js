const { prisma } = require('./prisma');

class UnitOfWork {
  constructor(db = prisma) {
    this.db = db;
  }

  run(work) {
    return this.db.$transaction((tx) => work(tx));
  }
}

module.exports = { UnitOfWork };
