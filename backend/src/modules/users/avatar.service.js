class AvatarService {
  constructor({ userRepository, fileStorage }) {
    this.userRepository = userRepository;
    this.fileStorage = fileStorage;
  }
}

module.exports = { AvatarService };
