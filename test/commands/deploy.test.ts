import base, { expect } from '@oclif/test';
import nock from 'nock';

nock.disableNetConnect();

const test = base.env({ BUMP_TOKEN: 'BAR' });

describe('deploy subcommand', () => {
  describe('Successful runs', () => {
    test
      .nock('https://bump.sh', (api) =>
        api
          .post(
            '/api/v1/versions',
            (body) => body.documentation === 'coucou' && !body.branch_name,
          )
          .reply(201, { doc_public_url: 'http://localhost/doc/1' }),
      )
      .stdout()
      .stderr()
      .command(['deploy', 'examples/valid/openapi.v3.json', '--doc', 'coucou'])
      .it('sends new version to Bump', ({ stdout }) => {
        expect(stdout).to.contain(
          'Your new documentation version will soon be ready at http://localhost/doc/1',
        );
      });

    test
      .nock('https://bump.sh', (api) =>
        api
          .post(
            '/api/v1/versions',
            (body) => body.documentation === 'coucou' && body.branch_name === 'next',
          )
          .reply(201, { doc_public_url: 'http://localhost/doc/1/next' }),
      )
      .stdout()
      .stderr()
      .command([
        'deploy',
        'examples/valid/openapi.v3.json',
        '--doc',
        'coucou',
        '--branch',
        'next',
      ])
      .it('sends new version to Bump on given branch', ({ stdout }) => {
        expect(stdout).to.contain(
          'Your new documentation version will soon be ready at http://localhost/doc/1/next',
        );
      });

    test
      .nock('https://bump.sh', (api) => api.post('/api/v1/versions').reply(204))
      .stdout()
      .stderr()
      .command(['deploy', 'examples/valid/openapi.v3.json', '--doc', 'coucou'])
      .it('sends unchanged version to Bump', ({ stderr }) => {
        expect(stderr).to.contain("Let's deploy a new version");
        expect(stderr).to.contain('Your documentation has not changed');
      });

    test
      .env({ BUMP_ID: 'coucou' })
      .nock('https://bump.sh', (api) => api.post('/api/v1/versions').reply(201))
      .stdout()
      .stderr()
      .command(['deploy', 'examples/valid/openapi.v3.json'])
      .it('sends version to Bump with doc read from env variable', ({ stdout }) => {
        expect(stdout).to.contain('Your new documentation version will soon be ready');
      });

    describe('Successful dry-run deploy', () => {
      test
        .nock('https://bump.sh', (api) => api.post('/api/v1/validations').reply(200))
        .stdout()
        .stderr()
        .command([
          'deploy',
          'examples/valid/openapi.v3.json',
          '--doc',
          'coucou',
          '--dry-run',
        ])
        .it('sends validation to Bump', ({ stdout }) => {
          expect(stdout).to.contain('Definition is valid');
        });

      test
        .nock('https://bump.sh', (api) =>
          api
            .post('/api/v1/validations', (body) => !body.auto_create_documentation)
            .reply(200),
        )
        .stdout()
        .stderr()
        .command([
          'deploy',
          'examples/valid/openapi.v3.json',
          '--doc',
          'coucou',
          '--hub',
          'coucou',
          '--dry-run',
          '--auto-create',
        ])
        .it("doesn't try to auto create a documentation");
    });
  });

  describe('Successful runs on a directory', () => {
    test
      .nock('https://bump.sh', (api) =>
        api
          .post(
            '/api/v1/versions',
            (body) =>
              // The “bump” slug is taken from the filename convention
              // in “bump-api.json”
              body.documentation === 'bump' && body.hub === 'my-hub' && !body.branch_name,
          )
          .reply(201, { doc_public_url: 'http://localhost/doc/1' }),
      )
      .stdout()
      .stderr()
      .command(['deploy', 'examples/valid/', '--hub', 'my-hub'])
      .it('sends new version to Bump', ({ stdout }) => {
        expect(stdout).to.contain(
          'Your new documentation version will soon be ready at http://localhost/doc/1',
        );
      });
  });

  describe('Successful runs with a URL', () => {
    test
      .nock('https://bump.sh', (api) =>
        api
          .post(
            '/api/v1/versions',
            (body) => body.documentation === 'coucou' && !body.branch_name,
          )
          .reply(201, { doc_public_url: 'http://localhost/doc/1' }),
      )
      .nock('https://developers.bump.sh', (api) =>
        api
          .get('/source.json')
          .replyWithFile(200, 'examples/valid/asyncapi.no-refs.v2.yml', {
            'Content-Type': 'application/json',
          }),
      )
      .stdout()
      .stderr()
      .command(['deploy', 'https://developers.bump.sh/source.json', '--doc', 'coucou'])
      .it('sends new version to Bump', ({ stdout }) => {
        expect(stdout).to.contain(
          'Your new documentation version will soon be ready at http://localhost/doc/1',
        );
      });
  });

  describe('Server errors', () => {
    describe('Authentication error', () => {
      test
        .nock('https://bump.sh', (api) => api.post('/api/v1/versions').reply(401))
        .stdout()
        .stderr()
        .command(['deploy', 'examples/valid/openapi.v3.json', '--doc', 'coucou'])
        .catch((err) => {
          expect(err.message).to.contain('not allowed to deploy');
          throw err;
        })
        .exit(101)
        .it("Doesn't create a deployed version", ({ stdout }) => {
          expect(stdout).to.not.contain(
            'Your new documentation version will soon be ready',
          );
        });
    });

    describe('Not found error', () => {
      test
        .nock('https://bump.sh', (api) => api.post('/api/v1/versions').reply(404))
        .stdout()
        .stderr()
        .command(['deploy', 'examples/valid/openapi.v3.json', '--doc', 'coucou'])
        .catch((err) => {
          expect(err.message).to.contain(
            "It seems the documentation provided doesn't exist",
          );
          throw err;
        })
        .exit(104)
        .it("Doesn't create a deployed version", ({ stdout }) => {
          expect(stdout).to.not.contain(
            'Your new documentation version will soon be ready',
          );
        });
    });

    describe('Payment required', () => {
      test
        .nock('https://bump.sh', (api) => {
          api.post('/api/v1/versions').reply(402, {
            message:
              'You need to upgrade to a paid plan to perform this request. Please go to https://bump.sh/account/billing',
          });
        })
        .stdout()
        .stderr()
        .command(['deploy', 'examples/valid/openapi.v3.json', '--doc', 'coucou'])
        .catch((err) => {
          expect(err.message).to.contain(
            'You need to upgrade to a paid plan to perform this request. Please go to https://bump.sh/account/billing',
          );
          throw err;
        })
        .exit(102)
        .it("Doesn't create a deployed version", ({ stdout }) => {
          expect(stdout).to.not.contain(
            'Your new documentation version will soon be ready',
          );
        });
    });

    describe('Invalid dry-run deploy', () => {
      test
        .nock('https://bump.sh', (api) => api.post('/api/v1/validations').reply(422))
        .stdout()
        .stderr()
        .command([
          'deploy',
          'examples/invalid/asyncapi.yml',
          '--doc',
          'coucou',
          '--dry-run',
        ])
        .catch((err) => {
          expect(err.message).to.contain('Invalid definition file');
          throw err;
        })
        .exit(122)
        .it('warns user about the invalid version with details');
    });
  });

  describe('User bad usages', () => {
    test
      .command(['deploy', 'FILE', '--doc', 'coucou'])
      .catch((err) => expect(err.message).to.match(/no such file or directory/))
      .it('Fails deploying an inexistant file');

    test
      .command(['deploy'])
      .exit(2)
      .it('exits with status 2 when no file argument is provided');

    test
      .command(['deploy', 'examples/valid/openapi.v3.json'])
      .catch((err) => expect(err.message).to.match(/missing required flag(.|\n)+--doc/im))
      .it('fails when no documentation id or slug is provided');

    test
      .env({ BUMP_TOKEN: '' }, { clear: true })
      .command(['deploy', 'examples/valid/openapi.v3.json', '--doc', 'coucou'])
      .catch((err) =>
        expect(err.message).to.match(/missing required flag(.|\n)+--token/im),
      )
      .it('fails when no access token is provided');
  });
});
