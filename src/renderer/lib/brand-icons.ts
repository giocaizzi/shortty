/**
 * Brand glyphs for sources and CLI commands, from simple-icons (CC0; marks
 * are used only to identify the tool, docs/spec.md §15). Named imports keep
 * the bundle to the icons listed here.
 *
 * Absent on purpose: logos simple-icons does not carry (VS Code, Finder,
 * Azure, AWS, OpenAI, Java). Those fall back to the app icon or the monogram.
 */
import {
  si1password, siAnaconda, siAnsible, siApple, siArgo, siBitwarden, siBiome, siBruno, siBun,
  siCaddy, siClaude, siCloudflare, siCloudflareworkers, siCmake, siCocoapods, siComposer, siConsul,
  siDart, siDeno, siDigitalocean, siDocker, siDotnet, siElectron, siElixir, siErlang, siEslint,
  siExpo, siFastlane, siFfmpeg, siFirebase, siFlutter, siFlydotio, siGhostty, siGit, siGithub,
  siGithubactions, siGithubcopilot, siGitlab, siGnubash, siGnuemacs, siGnuprivacyguard, siGo,
  siGooglechrome, siGooglecloud, siGradle, siHaskell, siHelm, siHomebrew, siHttpie, siJupyter,
  siKotlin, siKubernetes, siLatex, siLlvm, siLua, siMariadb, siMongodb, siMysql, siNeovim,
  siNetlify, siNginx, siNgrok, siNixos, siNodedotjs, siNomad, siNpm, siObsidian, siOllama,
  siOpencode, siOpenjdk, siOpenssl, siPacker, siPerl, siPhp, siPnpm, siPodman, siPoetry,
  siPostgresql, siPrettier, siPrometheus, siPulumi, siPython, siRabbitmq, siRedis, siRuby,
  siRubygems, siRust, siScala, siSqlite, siStarship, siStripe, siSupabase, siSwift, siTailscale,
  siTerraform, siTmux, siTypescript, siUv, siVagrant, siVault, siVercel, siVim, siVitest,
  siWireguard, siXcode, siYarn, siZig, siZsh, siCurl,
  type SimpleIcon,
} from 'simple-icons';

export type BrandIcon = Pick<SimpleIcon, 'title' | 'hex' | 'path'>;

/** Sources without a real app icon (CLI tools), or whose app is not installed. */
const SOURCES: Record<string, BrandIcon> = {
  chrome: siGooglechrome,
  ghostty: siGhostty,
  obsidian: siObsidian,
  'macos-system': siApple,
  tmux: siTmux,
  vim: siVim,
  zsh: siZsh,
  bash: siGnubash,
};

/** Command name (after version suffixes are stripped, see brandIconForCommand). */
const COMMANDS: Record<string, BrandIcon> = {
  git: siGit, gh: siGithub, glab: siGitlab,
  docker: siDocker, 'docker-compose': siDocker, podman: siPodman,
  kubectl: siKubernetes, helm: siHelm, argo: siArgo,
  terraform: siTerraform, packer: siPacker, vagrant: siVagrant, consul: siConsul, vault: siVault,
  nomad: siNomad, pulumi: siPulumi, ansible: siAnsible, 'ansible-playbook': siAnsible,
  gcloud: siGooglecloud, gsutil: siGooglecloud, bq: siGooglecloud, firebase: siFirebase,
  vercel: siVercel, netlify: siNetlify, flyctl: siFlydotio, fly: siFlydotio,
  wrangler: siCloudflareworkers, cloudflared: siCloudflare, doctl: siDigitalocean,
  supabase: siSupabase, stripe: siStripe, ngrok: siNgrok, tailscale: siTailscale, wg: siWireguard,
  node: siNodedotjs, npm: siNpm, npx: siNpm, yarn: siYarn, pnpm: siPnpm, bun: siBun, bunx: siBun,
  deno: siDeno, tsc: siTypescript, tsserver: siTypescript, eslint: siEslint, prettier: siPrettier,
  biome: siBiome, vitest: siVitest, electron: siElectron,
  python: siPython, pip: siPython, pydoc: siPython, idle: siPython, uv: siUv, uvx: siUv,
  poetry: siPoetry, jupyter: siJupyter, conda: siAnaconda,
  cargo: siRust, rustc: siRust, rustup: siRust, go: siGo, gofmt: siGo,
  java: siOpenjdk, javac: siOpenjdk, kotlin: siKotlin, gradle: siGradle, scala: siScala,
  swift: siSwift, swiftc: siSwift, xcodebuild: siXcode, xcrun: siXcode, pod: siCocoapods,
  fastlane: siFastlane, flutter: siFlutter, dart: siDart, eas: siExpo, expo: siExpo,
  ruby: siRuby, irb: siRuby, gem: siRubygems, php: siPhp, composer: siComposer, perl: siPerl,
  lua: siLua, zig: siZig, clang: siLlvm, 'clang++': siLlvm, cmake: siCmake, dotnet: siDotnet,
  elixir: siElixir, iex: siElixir, mix: siElixir, erl: siErlang, ghc: siHaskell, cabal: siHaskell,
  psql: siPostgresql, postgres: siPostgresql, pg_dump: siPostgresql, pg_restore: siPostgresql,
  mysql: siMysql, mariadb: siMariadb, sqlite3: siSqlite, 'redis-cli': siRedis,
  'redis-server': siRedis, mongosh: siMongodb, mongod: siMongodb, rabbitmqctl: siRabbitmq,
  prometheus: siPrometheus, nginx: siNginx, caddy: siCaddy,
  ffmpeg: siFfmpeg, ffprobe: siFfmpeg, ffplay: siFfmpeg, openssl: siOpenssl, curl: siCurl,
  http: siHttpie, https: siHttpie, gpg: siGnuprivacyguard,
  latex: siLatex, pdflatex: siLatex, xelatex: siLatex, lualatex: siLatex, latexmk: siLatex,
  tmux: siTmux, vim: siVim, vi: siVim, vimdiff: siVim, view: siVim, nvim: siNeovim,
  emacs: siGnuemacs, zsh: siZsh, bash: siGnubash, starship: siStarship, nix: siNixos,
  brew: siHomebrew, bw: siBitwarden, bws: siBitwarden, op: si1password,
  actionlint: siGithubactions, copilot: siGithubcopilot, claude: siClaude, opencode: siOpencode,
  ollama: siOllama, bru: siBruno, ghostty: siGhostty,
};

export function brandIconForSource(id: string): BrandIcon | undefined {
  return SOURCES[id];
}

/** `python3.12`, `pip3`, `psql-17` resolve like `python`, `pip`, `psql`. */
export function brandIconForCommand(name: string): BrandIcon | undefined {
  return COMMANDS[name] ?? COMMANDS[name.replace(/[-.]?\d+(\.\d+)*$/, '')];
}

/** WCAG relative luminance of a 6-digit hex colour. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Approximate luminance of the launcher/preferences backgrounds per theme.
const LIGHT_BG = 0.83;
const DARK_BG = 0.014;
/** WCAG 1.4.11 minimum contrast for graphical objects. */
const MIN_CONTRAST = 3;

/**
 * The theme on which the brand colour would be too faint (under 3:1), or
 * undefined when it reads on both. The tile then mixes it with the
 * foreground colour on that theme (globals.css / preferences.css).
 */
export function weakTheme(hex: string): 'light' | 'dark' | undefined {
  const l = luminance(hex);
  if ((LIGHT_BG + 0.05) / (l + 0.05) < MIN_CONTRAST) return 'light';
  if ((l + 0.05) / (DARK_BG + 0.05) < MIN_CONTRAST) return 'dark';
  return undefined;
}
