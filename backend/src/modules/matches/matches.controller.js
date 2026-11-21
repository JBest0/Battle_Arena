class MatchesController {
  constructor({ matchesService }) {
    this.matchesService = matchesService;
  }

  async getResult(req, res) {
    const result = await this.matchesService.getResult(
      req.params.id,
      req.user.id
    );
    return res.status(200).json(result);
  }
}

module.exports = { MatchesController };
