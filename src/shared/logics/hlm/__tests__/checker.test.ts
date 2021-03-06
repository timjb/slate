import { PhysicalFileAccessor } from '../../../../fs/data/physicalFileAccessor';
import { LibraryDataProvider, LibraryDataProviderOptions, LibraryDefinition } from '../../../data/libraryDataProvider';
import * as Fmt from '../../../format/format';
import * as FmtLibrary from '../../library';
import * as Logic from '../../logic';
import * as Logics from '../../logics';

async function checkSection(libraryDataProvider: LibraryDataProvider) {
  let section = await libraryDataProvider.fetchLocalSection();
  let contents = section.definition.contents as FmtLibrary.ObjectContents_Section;
  for (let item of contents.items) {
    if (item instanceof FmtLibrary.MetaRefExpression_item) {
      let ref = item.ref as Fmt.DefinitionRefExpression;
      let definition = await libraryDataProvider.fetchLocalItem(ref.path.name, true);
      await checkItem(libraryDataProvider, definition);
    } else if (item instanceof FmtLibrary.MetaRefExpression_subsection) {
      let ref = item.ref as Fmt.DefinitionRefExpression;
      let childProvider = await libraryDataProvider.getProviderForSection(ref.path);
      await checkSection(childProvider);
    }
  }
}

async function checkItem(libraryDataProvider: LibraryDataProvider, definition: LibraryDefinition) {
  let checker = libraryDataProvider.logic.getChecker();
  let options: Logic.LogicCheckerOptions = {
    supportPlaceholders: false,
    supportRechecking: false,
    warnAboutMissingProofs: true
  };
  let checkResult: Logic.LogicCheckResult = await checker.checkDefinition(definition.definition, libraryDataProvider, options);
  let expectedDiagnostics: Logic.LogicCheckDiagnostic[] = [];
  if (definition.definition.documentation) {
    for (let item of definition.definition.documentation.items) {
      let severity: Logic.DiagnosticSeverity;
      switch (item.kind) {
      case 'expectedError':
        severity = Logic.DiagnosticSeverity.Error;
        break;
      case 'expectedWarning':
        severity = Logic.DiagnosticSeverity.Warning;
        break;
      default:
        continue;
      }
      expectedDiagnostics.push({
        object: definition.definition.name,
        severity: severity,
        message: item.text
      });
    }
  }
  for (let diagnostic of checkResult.diagnostics) {
    diagnostic.object = definition.definition.name;
  }
  expect(checkResult.diagnostics).toEqual(expectedDiagnostics);
}

test('run checker test suite', async () => {
  let libraryDataProviderOptions: LibraryDataProviderOptions = {
    logic: Logics.hlm,
    fileAccessor: new PhysicalFileAccessor('src/shared/logics/hlm/__tests__/data'),
    watchForChanges: false,
    checkMarkdownCode: false,
    allowPlaceholders: false
  };
  let libraryDataProvider = new LibraryDataProvider(libraryDataProviderOptions);
  await checkSection(libraryDataProvider);
});
