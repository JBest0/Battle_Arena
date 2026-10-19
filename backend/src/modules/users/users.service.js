class UsersService {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }
}

module.exports = { UsersService };
