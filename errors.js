class PermissionError extends Error {
  constructor(path, message) {
    super(`Permission denied: ${path}. ${message}`);
    this.name = 'PermissionError';
    this.path = path;
  }
}

module.exports = { PermissionError };
