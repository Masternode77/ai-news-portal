export class ConfigError extends Error {
  readonly path: string | undefined;

  constructor(message: string, path?: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = "ConfigError";
    this.path = path;
  }
}
