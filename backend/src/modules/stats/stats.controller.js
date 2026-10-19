class StatsController {
  constructor({ statsService }) {
    this.statsService = statsService;
  }

  async getRanking(req, res) {
    const ranking = await this.statsService.getRanking(req.query.limit);

    return res.status(200).json(ranking);
  }
}

module.exports = { StatsController };
