/**
 * Golden tests for the optional help sections (docs/spec.md §7.8): flag
 * groups, defaults, choices, required/deprecated markers, examples,
 * environment variables, aliases and see-also links, on real captured
 * output (fixtures/commands/). Every expectation was checked against the
 * raw text.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FlagDetail } from '../../../src/shared/types';
import { parseManContent } from '../../../src/main/commands/parsers/man-parser';
import { parseHelpOutput } from '../../../src/main/commands/parsers/help-parser';
import { assertDefined } from '../../helpers';

const ROOT = join(__dirname, '../../../fixtures/commands');

function parse(rel: string, name: string) {
  const text = readFileSync(join(ROOT, rel), 'utf-8');
  const result = rel.split('/')[1].startsWith('man') ? parseManContent(text, name) : parseHelpOutput(text, name);
  assertDefined(result);
  return result;
}

function flag(flags: FlagDetail[], name: string): FlagDetail {
  const found = flags.find(f => f.long === name || f.short === name);
  assertDefined(found);
  return found;
}

describe('golden extras: gh (cobra help and man pages)', () => {
  const help = parse('gh/pr-list-help.txt', 'gh pr list');
  const man = parse('gh/man-pr-list.txt', 'gh pr list');

  it('aliases, defaults and {a|b} choices', () => {
    expect(help.aliases).toEqual(['gh pr ls']);
    expect(man.aliases).toEqual(['gh pr ls']);
    expect(flag(help.flags, '--state')).toMatchObject({
      short: '-s', arg: 'string', default: 'open', choices: ['open', 'closed', 'merged', 'all'],
      description: 'Filter by state: {open|closed|merged|all}',
    });
    expect(flag(help.flags, '--limit')).toMatchObject({ default: '30', description: 'Maximum number of items to fetch' });
    expect(flag(man.flags, '--limit')).toMatchObject({ default: '30', arg: '<int>' });
  });

  it('flag groups: FLAGS vs INHERITED FLAGS', () => {
    expect(flag(help.flags, '--web').group).toBe('FLAGS');
    expect(flag(help.flags, '--repo').group).toBe('INHERITED FLAGS');
    expect(flag(man.flags, '--repo').group).toBe('OPTIONS INHERITED FROM PARENT COMMANDS');
  });

  it('examples: "# comment" + "$ command"', () => {
    for (const result of [help, man]) {
      expect(result.examples).toHaveLength(6);
      expect(result.examples?.[0]).toEqual({ command: 'gh pr list --author "@me"', description: 'List PRs authored by you' });
      expect(result.examples?.[5]).toEqual({
        command: 'gh pr list --search "<SHA>" --state merged',
        description: 'Find a PR that introduced a given commit',
      });
    }
  });

  it('see also: LEARN MORE lines, man references without the page footer', () => {
    expect(help.seeAlso).toContain('Read the manual at https://cli.github.com/manual');
    expect(man.seeAlso).toEqual(['gh-pr(1)']);
  });

  it('gh --help: command sections become subcommand groups', () => {
    const root = parse('gh/help.txt', 'gh');
    expect(root.subcommands.find(s => s.name === 'gh auth')?.group).toBe('CORE COMMANDS');
    expect(root.subcommands.find(s => s.name === 'gh run')?.group).toBe('GITHUB ACTIONS COMMANDS');
    expect(root.examples?.map(e => e.command)).toEqual(['gh issue create', 'gh repo clone cli/cli', 'gh pr checkout 321']);
  });
});

describe('golden extras: gcloud (man-style --help)', () => {
  it('gcloud --help: GROUPS and COMMANDS, global flags with default and choices', () => {
    const result = parse('gcloud/help.txt', 'gcloud');
    expect(result.description).toBe('manage Google Cloud resources and developer workflow');
    expect(result.synopsis).toMatch(/^gcloud GROUP \| COMMAND \[--account=ACCOUNT\]/);
    const compute = result.subcommands.find(s => s.name === 'gcloud compute');
    expect(compute).toEqual({ name: 'gcloud compute', description: 'Create and manipulate Compute Engine resources.', group: 'GROUPS' });
    expect(result.subcommands.find(s => s.name === 'gcloud init')?.group).toBe('COMMANDS');
    expect(result.subcommands.filter(s => s.group === 'GROUPS')).toHaveLength(134);
    expect(result.subcommands.find(s => s.name === 'gcloud docker')?.deprecated).toBe(true);
    expect(flag(result.flags, '--verbosity')).toMatchObject({
      arg: 'VERBOSITY', default: 'warning', group: 'GLOBAL FLAGS',
      choices: ['debug', 'info', 'warning', 'error', 'critical', 'none'],
    });
    expect(flag(result.flags, '--flatten').description).toMatch(/This also flattens keys for --format and --filter/);
    expect(flag(result.flags, '--flatten').choices).toBeUndefined();
    expect(flag(result.flags, '--quiet')).toMatchObject({ short: '-q', group: 'GLOBAL FLAGS' });
    expect(flag(result.flags, '--log-http').group).toBe('OTHER FLAGS');
  });

  it('gcloud compute instances --help: groups, deprecated commands', () => {
    const result = parse('gcloud/compute-instances-help.txt', 'gcloud compute instances');
    expect(result.subcommands.filter(s => s.group === 'GROUPS').map(s => s.name)).toEqual([
      'gcloud compute instances bulk', 'gcloud compute instances network-interfaces',
      'gcloud compute instances ops-agents', 'gcloud compute instances os-inventory',
    ]);
    expect(result.subcommands).toHaveLength(53);
    expect(result.subcommands.find(s => s.name === 'gcloud compute instances create-with-container')).toMatchObject({
      deprecated: true, description: 'Creates Compute Engine virtual machine instances running container images.',
    });
  });

  it('gcloud compute instances create --help: positionals, examples, choices', () => {
    const result = parse('gcloud/compute-instances-create-help.txt', 'gcloud compute instances create');
    expect(result.description).toBe('create Compute Engine virtual machine instances');
    expect(result.arguments).toEqual([{
      name: 'INSTANCE_NAMES', required: true, variadic: true,
      description: "Names of the instances to create. For details on valid instance names, refer to the criteria documented under the field 'name' at: https://cloud.google.com/compute/docs/reference/rest/v1/instances",
    }]);
    expect(result.flags).toHaveLength(111);
    expect(result.examples).toHaveLength(5);
    expect(result.examples?.[0]).toEqual({
      command: 'gcloud compute instances create example-instance --image-family=rhel-8 --image-project=rhel-cloud --zone=us-central1-a',
      description: "To create an instance with the latest 'Red Hat Enterprise Linux 8' image available",
    });
    // "--source-snapshot=https://compute.googleapis.com/compute/v1/\" + "projects/..." joins without a space
    expect(result.examples?.[2].command).toContain('--source-snapshot=https://compute.googleapis.com/compute/v1/projects/myproject/global/snapshots/instance-snapshot --zone');
    expect(flag(result.flags, '--boot-disk-interface').choices).toEqual(['SCSI', 'NVME']);
    expect(flag(result.flags, '--maintenance-policy').choices).toEqual(['MIGRATE', 'TERMINATE']);
    expect(flag(result.flags, '--network-tier').choices).toEqual(['PREMIUM', 'STANDARD']);
    // choices of a nested key (nic-type) are not the flag's
    expect(flag(result.flags, '--network-interface').choices).toBeUndefined();
    expect(flag(result.flags, '--csek-key-file').deprecated).toBe(true);
    expect(flag(result.flags, '--reservation-affinity').default).toBe('any');
  });
});

describe('golden extras: az (knack)', () => {
  it('az --help: first-run banner ignored, Subgroups and Commands', () => {
    const result = parse('az/help.txt', 'az');
    expect(result.subcommands).toHaveLength(100);
    expect(result.subcommands.find(s => s.name === 'az vm')).toEqual({
      name: 'az vm', description: 'Manage Linux or Windows virtual machines.', group: 'Subgroups',
    });
    expect(result.subcommands.find(s => s.name === 'az login')?.group).toBe('Commands');
    // "[Experimental]" marker stripped
    expect(result.subcommands.find(s => s.name === 'az config')?.description).toBe('Manage Azure CLI configuration.');
    // wrapped descriptions are joined
    expect(result.subcommands.find(s => s.name === 'az ad')?.description).toBe(
      'Manage Microsoft Entra ID (formerly known as Azure Active Directory, Azure AD, AAD) entities needed for Azure role-based access control (Azure RBAC) through Microsoft Graph API.',
    );
    expect(result.longDescription).toBeUndefined();
  });

  it('az vm --help: group description, deprecated commands', () => {
    const result = parse('az/vm-help.txt', 'az vm');
    expect(result.description).toBe('Manage Linux or Windows virtual machines.');
    expect(result.subcommands.filter(s => s.group === 'Subgroups')).toHaveLength(16);
    expect(result.subcommands.filter(s => s.group === 'Commands')).toHaveLength(30);
    expect(result.subcommands.find(s => s.name === 'az vm list-sizes')?.deprecated).toBe(true);
  });

  it('az storage account --help: nested group', () => {
    const result = parse('az/storage-account-help.txt', 'az storage account');
    expect(result.description).toBe('Manage storage accounts.');
    expect(result.subcommands.map(s => s.name)).toContain('az storage account keys');
    expect(result.subcommands.find(s => s.name === 'az storage account create')?.group).toBe('Commands');
  });

  it('az vm create --help: [Required], allowed values, defaults, argument groups', () => {
    const result = parse('az/vm-create-help.txt', 'az vm create');
    expect(result.description).toBe('Create an Azure Virtual Machine.');
    expect(flag(result.flags, '--name')).toEqual({
      short: '-n', long: '--name', description: 'Name of the virtual machine.', required: true, group: 'Arguments',
    });
    expect(flag(result.flags, '--ssh-key-type')).toMatchObject({
      choices: ['Ed25519', 'RSA'], default: 'RSA', group: 'Authentication Arguments',
      description: 'Specify the type of SSH public and private key files to be generated if missing.',
    });
    expect(flag(result.flags, '--size').default).toBe('Standard_D2s_v5');
    // "--enable-proxy-" + "agent" rejoined across the wrap
    expect(flag(result.flags, '--add-proxy-agent-ext').description).toContain('Use with --enable-proxy-agent.');
    expect(flag(result.flags, '--proxy-agent-mode').deprecated).toBe(true);
    expect(flag(result.flags, '--subscription').group).toBe('Global Arguments');
    expect(new Set(result.flags.map(f => f.group)).size).toBe(10);
  });

  it('az vm create --help: examples with hard-wrapped commands', () => {
    const result = parse('az/vm-create-help.txt', 'az vm create');
    expect(result.examples).toHaveLength(23);
    expect(result.examples?.[0]).toEqual({
      command: 'az vm create -n MyVm -g MyResourceGroup --image Ubuntu2204',
      description: 'Create a default Ubuntu2204 VM with automatic SSH authentication.',
    });
    // a long path wrapped at the margin and at hyphens
    expect(result.examples?.[4].command).toBe(
      'az vm create -g MyResourceGroup -n MyVm --image /subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/myRG/providers/Microsoft.Compute/galleries/myGallery/images/myImage/versions/1.0.0',
    );
    expect(result.examples?.[8].command).toBe(
      'az vm create -g MyResourceGroup -n MyVm --attach-os-disk https://vhd1234.blob.core.windows.net/vhds/osdisk1234.vhd --os-type linux --use-unmanaged-disk',
    );
    // a wrapped "\" continuation
    expect(result.examples?.[10].command).toBe(
      'az vm create -n MyVm -g MyResourceGroup --image Debian11 --vnet-name MyVnet --subnet subnet1 --availability-set MyAvailabilitySet --public-ip-address-dns-name MyUniqueDnsName --ssh-key-values @key-file',
    );
  });

  it('az aks create --help: required flags', () => {
    const result = parse('az/aks-create-help.txt', 'az aks create');
    expect(result.flags.filter(f => f.required).map(f => f.long)).toEqual(['--name', '--resource-group']);
    expect(result.examples?.length).toBeGreaterThan(40);
  });
});

describe('golden extras: other formats', () => {
  it('kubectl get --help: "--flag=default:" defaults and "# comment" examples', () => {
    const result = parse('kubectl/get-help.txt', 'kubectl get');
    expect(flag(result.flags, '--chunk-size').default).toBe('500');
    expect(flag(result.flags, '--all-namespaces').default).toBe('false');
    expect(flag(result.flags, '--field-selector').default).toBeUndefined();
    expect(result.examples).toHaveLength(14);
    expect(result.examples?.[1]).toEqual({
      command: 'kubectl get pods -o wide',
      description: 'List all pods in ps output format with more information (such as node name)',
    });
  });

  it('docker run --help: aliases and Go defaults', () => {
    const result = parse('docker/run-help.txt', 'docker run');
    expect(result.aliases).toEqual(['docker container run']);
    expect(flag(result.flags, '--stop-timeout').description).not.toMatch(/default/);
  });

  it('clap (bws): [default: x], [possible values: ...], "Possible values:" list, [env: X=]', () => {
    const result = parse('bws/help.txt', 'bws');
    expect(flag(result.flags, '--output')).toMatchObject({
      default: 'json', choices: ['json', 'yaml', 'env', 'table', 'tsv', 'none'], description: 'Output format',
    });
    expect(flag(result.flags, '--color')).toMatchObject({
      default: 'auto', choices: ['no', 'yes', 'auto'], description: 'Use colors in the output',
    });
    expect(result.environment).toContainEqual({ name: 'BWS_SERVER_URL', description: 'Same as --server-url' });
  });

  it('absl (bq): "--name: desc", (default: \'x\'), <a|b>: enums', () => {
    const result = parse('bq/help.txt', 'bq');
    expect(result.flags).toHaveLength(39);
    expect(flag(result.flags, '--api')).toMatchObject({ default: 'https://bigquery.googleapis.com', description: 'API endpoint to talk to.' });
    expect(flag(result.flags, '--alpha').choices).toEqual(['none', 'query_max_slots']);
    expect(flag(result.flags, '-q')).toMatchObject({ long: '--[no]quiet' });
  });

  it('commander (bw): "name [options] <arg>" commands, examples without descriptions, --DEPRECATED--', () => {
    const result = parse('bw/help.txt', 'bw');
    expect(result.subcommands).toHaveLength(29);
    expect(result.subcommands.find(s => s.name === 'bw login')?.description).toBe('Log into a user account.');
    expect(result.subcommands.find(s => s.name === 'bw share')).toMatchObject({ deprecated: true, description: 'Move an item to an organization.' });
    expect(result.subcommands.some(s => s.name === 'bw Tip')).toBe(false);
    expect(result.examples).toHaveLength(18);
    expect(result.examples?.[7]).toEqual({ command: 'echo \'{"name":"My Folder"}\' | bw encode', description: '' });
  });

  it('click (cookiecutter): [a|b] argument choices; argparse (wheel3): {a,b} subcommands', () => {
    expect(flag(parse('cookiecutter/help.txt', 'cookiecutter').flags, '--accept-hooks').choices).toEqual(['yes', 'ask', 'no']);
    expect(parse('cookiecutter/help.txt', 'cookiecutter').longDescription).toBe('Create a project from a Cookiecutter project template (TEMPLATE).');
    expect(parse('wheel3/help.txt', 'wheel3').subcommands.map(s => s.name.split(' ')[1])).toEqual(
      ['unpack', 'pack', 'convert', 'tags', 'info', 'version', 'help'],
    );
  });

  it('tsc: column-0 descriptions with type/default/one of lines', () => {
    const result = parse('tsc/help.txt', 'tsc');
    expect(flag(result.flags, '--pretty')).toMatchObject({ default: 'true', description: "Enable color and formatting in TypeScript's output to make compiler errors easier to read." });
    expect(flag(result.flags, '--target')).toMatchObject({ short: '-t', default: 'es5' });
    expect(flag(result.flags, '--target').choices).toContain('esnext');
    expect(flag(result.flags, '--help').group).toBe('COMMAND LINE FLAGS');
  });

  it('terraform / java / openssl: single-dash long options', () => {
    expect(flag(parse('terraform/plan-help.txt', 'terraform plan').flags, '-var-file')).toMatchObject({ arg: 'filename', group: 'Plan Customization Options' });
    expect(flag(parse('java/help.txt', 'java').flags, '-agentlib')).toMatchObject({ arg: '<libname>[=<options>]' });
    expect(flag(parse('java/help.txt', 'java').flags, '-cp').arg).toBe('<class search path of directories and zip/jar files>');
    expect(flag(parse('openssl/req-help.txt', 'openssl req').flags, '-x509').group).toBe('Certificate options');
  });

  it('ffmpeg: option groups from help sections and man subsections', () => {
    expect(flag(parse('ffmpeg/help.txt', 'ffmpeg').flags, '-filters').group).toBe('Print help / information / capabilities');
    const man = parse('ffmpeg/man.txt', 'ffmpeg');
    expect(flag(man.flags, '-f').group).toBe('Main options');
    expect(flag(man.flags, '-vf').group).toBe('Video Options');
  });

  it('fzf: CAPS subsections are flag groups', () => {
    expect(flag(parse('fzf/help.txt', 'fzf').flags, '--height').group).toBe('DISPLAY MODE');
  });

  it('hadolint: "-h,--help" without a space, [a | b] choices in the description', () => {
    const result = parse('hadolint/help.txt', 'hadolint');
    expect(flag(result.flags, '--help').short).toBe('-h');
    expect(flag(result.flags, '--format').choices?.slice(0, 3)).toEqual(['tty', 'json', 'checkstyle']);
  });
});

describe('golden extras: man ENVIRONMENT, EXAMPLES, SEE ALSO', () => {
  it('psql: names sharing one description', () => {
    const env = parse('psql/man.txt', 'psql').environment ?? [];
    expect(env.find(v => v.name === 'PGHOST')?.description).toBe('Default connection parameters (see Section 32.15).');
    expect(env.find(v => v.name === 'PGPORT')?.description).toBe('Default connection parameters (see Section 32.15).');
  });

  it('curl: backticked lower-case names; node: "NAME value" terms', () => {
    expect(parse('curl/man.txt', 'curl').environment).toContainEqual({ name: 'http_proxy', description: 'Sets the proxy server to use for HTTP.' });
    const node = parse('node/man.txt', 'node').environment ?? [];
    expect(node.length).toBe(30);
    expect(node[0].name).toBe('FORCE_COLOR');
  });

  it('python3: COMMAND LINE OPTIONS and ENVIRONMENT VARIABLES sections', () => {
    const result = parse('python3/man.txt', 'python3');
    expect(result.flags).toHaveLength(25);
    expect(result.environment?.map(v => v.name)).toContain('PYTHONPATH');
  });

  it('find: explanation below the command (BSD)', () => {
    const examples = parse('find/man.txt', 'find').examples ?? [];
    expect(examples[0]).toEqual({ command: 'find / \\! -name "*.c" -print', description: 'Print out a list of all the files whose names do not end in .c.' });
  });

  it('ls / git: "$ " prompts; prose starting with the program is not a command', () => {
    expect(parse('ls/man.txt', 'ls').examples?.[0]).toEqual({ command: 'ls -l', description: 'List the contents of the current working directory in long format' });
    const git = parse('git/man-commit.txt', 'git commit').examples ?? [];
    expect(git[0].command).toBe('edit hello.c');
    expect(git.every(e => !e.command.includes('is used to record'))).toBe(true);
  });

  it('tmux: output after a "$ " command is not part of it', () => {
    expect(parse('tmux/man.txt', 'tmux').examples?.[2].command).toBe('tmux n');
  });

  it('grep: "-   description:" bullets', () => {
    expect(parse('grep/man.txt', 'grep').examples?.[0]).toEqual({ command: "grep 'patricia' myfile", description: 'Find all occurrences of the pattern ‘patricia’ in a file' });
  });

  it('ssh: SEE ALSO references', () => {
    expect(parse('ssh/man.txt', 'ssh').seeAlso).toContain('scp(1)');
  });
});
