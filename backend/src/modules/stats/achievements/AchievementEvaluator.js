class AchievementEvaluator {
  constructor(rules) {
    this.rules = rules;
  }

  evaluate(stats) {
    return this.rules
      .filter((rule) => rule.isUnlocked(stats))
      .map((rule) => rule.code);
  }
}

module.exports = { AchievementEvaluator };
