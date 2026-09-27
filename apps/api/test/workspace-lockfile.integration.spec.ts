import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

type Section = 'dependencies' | 'devDependencies';
type PackageManifest = Partial<Record<Section, Record<string, string>>>;
type Importer = Map<Section, Map<string, string>>;

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

function parseImporterSpecifiers(lockfile: string): Map<string, Importer> {
  const importers = new Map<string, Importer>();
  let importer: Importer | undefined;
  let section: Map<string, string> | undefined;
  let packageName: string | undefined;

  const lines = lockfile.split(/\r?\n/);
  for (const line of lines.slice(lines.indexOf('importers:') + 1)) {
    const importerMatch = line.match(/^ {2}(\S.*):$/);
    if (importerMatch) {
      importer = new Map();
      importers.set(unquote(importerMatch[1]), importer);
      section = undefined;
      continue;
    }

    const sectionMatch = line.match(/^ {4}(dependencies|devDependencies):$/);
    if (sectionMatch && importer) {
      section = new Map();
      importer.set(sectionMatch[1] as Section, section);
      continue;
    }

    const packageMatch = line.match(/^ {6}(\S.*):$/);
    if (packageMatch && section) {
      packageName = unquote(packageMatch[1]);
      continue;
    }

    const specifierMatch = line.match(/^ {8}specifier: (.+)$/);
    if (specifierMatch && section && packageName) {
      section.set(packageName, unquote(specifierMatch[1]));
      packageName = undefined;
    }
  }

  return importers;
}

describe('workspace lockfile', () => {
  test('lockfile-covers-api-dependencies', () => {
    const lockfilePath = fileURLToPath(new URL('../../../pnpm-lock.yaml', import.meta.url));
    expect(existsSync(lockfilePath)).toBe(true);
    const lockfile = readFileSync(lockfilePath, 'utf8');
    expect(lockfile).toMatch(/^lockfileVersion:\s*['"]?9\.0['"]?\s*$/m);

    const manifests: [string, PackageManifest, Section[]][] = [
      [
        '.',
        JSON.parse(readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8')),
        ['devDependencies'],
      ],
      [
        'apps/api',
        JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')),
        ['dependencies', 'devDependencies'],
      ],
    ];
    const importers = parseImporterSpecifiers(lockfile);

    for (const [name, manifest, sections] of manifests) {
      const importer = importers.get(name);
      expect(importer, `pnpm importer ${name}`).toBeDefined();
      for (const section of sections) {
        for (const [packageName, specifier] of Object.entries(manifest[section] ?? {})) {
          expect(importer?.get(section)?.get(packageName), `${name} ${section} ${packageName}`).toBe(specifier);
        }
      }
    }
  });
});
