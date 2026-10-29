import {readFileSync} from 'node:fs';
import path from 'node:path';
import {globSync} from 'glob';
import ts from 'typescript';

// A component is the module named after its folder, e.g. `src/button/button.tsx`
const components = globSync('*/*.tsx', {cwd: __dirname}).filter(
  file => path.basename(file, '.tsx') === path.dirname(file),
);

const COVERED_ELSEWHERE: Record<string, string> = {
  'control-help/control-help.tsx': 'the help text of Input, Select and other controls',
  'login-dialog/login-dialog.tsx': 'needs a live Hub server, which no story can reach',
};

function importsOf(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  return source.statements
    .filter(ts.isImportDeclaration)
    .map(({moduleSpecifier}) => (moduleSpecifier as ts.StringLiteral).text)
    .filter(specifier => specifier.startsWith('.'))
    .map(specifier => path.relative(__dirname, path.resolve(path.dirname(file), specifier)));
}

describe('Stories', () => {
  it('render every component, so the screenshot tests cover it', () => {
    const rendered = new Set(globSync('**/*.stories.{ts,tsx}', {cwd: __dirname, absolute: true}).flatMap(importsOf));
    const missing = components.filter(
      file => !(file in COVERED_ELSEWHERE) && !rendered.has(file.replace(/\.tsx$/, '')),
    );

    expect(missing).to.deep.equal([]);
  });
});
