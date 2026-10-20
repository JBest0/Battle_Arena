class GameController {
  constructor({ gameService }) {
    this.gameService = gameService;
  }

  async getOptions(req, res) {
    return res.status(200).json(this.gameService.getOptions());
  }

  async createMatch(req, res) {
    const match = await this.gameService.createMatch(req.user.id, req.body);

    return res.status(201).json({ match });
  }

  async getMatch(req, res) {
    const match = await this.gameService.getMatch(req.params.id);

    return res.status(200).json({ match });
  }
}

module.exports = { GameController };
