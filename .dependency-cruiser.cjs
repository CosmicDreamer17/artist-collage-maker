/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'Domain layer must not depend on Application or Infra layers.',
      severity: 'error',
      from: { path: '^packages/domain/' },
      to: { path: '^packages/(application|infra)/' },
    },
    {
      name: 'application-layer-boundaries',
      comment: 'Application layer cannot depend on Infra or Web/API layers.',
      severity: 'error',
      from: { path: '^packages/application/' },
      to: { path: '^packages/infra/|^apps/' },
    },
    {
      name: 'infra-layer-boundaries',
      comment: 'Infra layer cannot depend on Web/API layers.',
      severity: 'error',
      from: { path: '^packages/infra/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-cross-app-imports',
      comment: 'Apps cannot import each other directly.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
};
