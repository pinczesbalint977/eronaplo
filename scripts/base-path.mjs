/** Repository Pages use /repository/; account Pages and custom domains use /. */
export function resolveBasePath(env = process.env) {
  const explicit = env.VITE_BASE_PATH?.trim();
  if (explicit) {
    if (!/^\/(?:[A-Za-z0-9_.~-]+\/)*$/.test(explicit)
      || explicit.split('/').some((segment) => segment === '.' || segment === '..')) {
      throw new Error('VITE_BASE_PATH must be an absolute path with a trailing slash, e.g. /eronaplo/ or /.');
    }
    return explicit;
  }

  const [owner, repository] = env.GITHUB_REPOSITORY?.split('/') ?? [];
  if (!repository || repository.toLowerCase() === `${owner.toLowerCase()}.github.io`) return '/';
  return `/${repository}/`;
}
