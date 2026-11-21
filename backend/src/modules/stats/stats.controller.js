class StatsController {
  constructor({ statsService }) {
    this.statsService = statsService;
  }

  async getRanking(req, res) {
    const ranking =
      req.query.page !== undefined
        ? await this.statsService.getRankingPage(req.query)
        : await this.statsService.getRanking(req.query.limit);

    return res.status(200).json(ranking);
  }
}

module.exports = { StatsController };
