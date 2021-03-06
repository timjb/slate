import * as fs from 'fs';
import * as path from 'path';
import * as Fmt from '../shared/format/format';
import * as FmtReader from '../shared/format/read';
import * as FmtLibrary from '../shared/logics/library';
import * as Logic from '../shared/logics/logic';
import * as Logics from '../shared/logics/logics';
import { PhysicalFileAccessor } from '../fs/data/physicalFileAccessor';
import { LibraryDataProvider, LibraryDefinition, LibraryDataProviderOptions } from '../shared/data/libraryDataProvider';
import CachedPromise from '../shared/data/cachedPromise';

let errorCount = 0;
let warningCount = 0;

const logicCheckerOptions: Logic.LogicCheckerOptions = {
  supportPlaceholders: false,
  supportRechecking: false,
  warnAboutMissingProofs: false
};

function checkLibrary(fileName: string): CachedPromise<void> {
  let fileStr = fs.readFileSync(fileName, 'utf8');
  let file = FmtReader.readString(fileStr, fileName, FmtLibrary.getMetaModel);
  let contents = file.definitions[0].contents as FmtLibrary.ObjectContents_Library;
  let baseName = path.basename(fileName);
  let libraryName = baseName.substring(0, baseName.length - path.extname(baseName).length);
  let libraryDataProviderOptions: LibraryDataProviderOptions = {
    logic: Logics.findLogic(contents.logic)!,
    fileAccessor: new PhysicalFileAccessor(path.dirname(fileName)),
    watchForChanges: false,
    checkMarkdownCode: true,
    allowPlaceholders: false
  };
  let libraryDataProvider = new LibraryDataProvider(libraryDataProviderOptions, libraryName);
  return libraryDataProvider.fetchLocalSection().then((definition: LibraryDefinition) => checkSection(definition, libraryDataProvider));
}

function checkSection(definition: LibraryDefinition, libraryDataProvider: LibraryDataProvider): CachedPromise<void> {
  let promise = CachedPromise.resolve();
  let contents = definition.definition.contents as FmtLibrary.ObjectContents_Section;
  for (let item of contents.items) {
    if (item instanceof FmtLibrary.MetaRefExpression_item) {
      let ref = item.ref as Fmt.DefinitionRefExpression;
      promise = promise.then(() =>
        libraryDataProvider.fetchItem(ref.path, true).then((itemDefinition: LibraryDefinition) =>
          checkItem(itemDefinition, libraryDataProvider)));
    } else if (item instanceof FmtLibrary.MetaRefExpression_subsection) {
      let ref = item.ref as Fmt.DefinitionRefExpression;
      let subsectionDataProvider = libraryDataProvider.getProviderForSection(ref.path);
      promise = promise.then(() =>
        subsectionDataProvider.fetchLocalSection().then((subsectionDefinition: LibraryDefinition) =>
          checkSection(subsectionDefinition, subsectionDataProvider)));
    }
  }
  return promise;
}

function checkItem(definition: LibraryDefinition, libraryDataProvider: LibraryDataProvider): CachedPromise<void> {
  let checker = libraryDataProvider.logic.getChecker();
  return checker.checkDefinition(definition.definition, libraryDataProvider, logicCheckerOptions).then((checkResult: Logic.LogicCheckResult) => {
    for (let diagnostic of checkResult.diagnostics) {
      let message = diagnostic.message;
      switch (diagnostic.severity) {
      case Logic.DiagnosticSeverity.Error:
        message = `Error: ${message}`;
        errorCount++;
        break;
      case Logic.DiagnosticSeverity.Warning:
        message = `Warning: ${message}`;
        warningCount++;
        break;
      case Logic.DiagnosticSeverity.Information:
        message = `Information: ${message}`;
        break;
      case Logic.DiagnosticSeverity.Hint:
        message = `Hint: ${message}`;
        break;
      }
      if (definition.fileReference) {
        message = `${definition.fileReference.fileName}: ${message}`;
      }
      console.error(message);
    }
  });
}

if (process.argv.length !== 3) {
  console.error('usage: src/scripts/check.sh <libraryFile>');
  process.exit(2);
}

let libraryFileName = process.argv[2];
checkLibrary(libraryFileName)
  .then(() => {
    console.error(`Found ${errorCount} error(s) and ${warningCount} warning(s).`);
    process.exit(errorCount ? 1 : 0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
