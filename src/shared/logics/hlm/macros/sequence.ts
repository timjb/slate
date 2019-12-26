import * as Fmt from '../../../format/format';
import * as FmtHLM from '../meta';
import * as Logic from '../../logic';
import { LibraryDataAccessor } from '../../../data/libraryDataAccessor';
import { HLMUtils } from '../utils';
import * as HLMMacro from '../macro';
import CachedPromise from '../../../data/cachedPromise';

export class SequenceMacro implements HLMMacro.HLMMacro {
  name = 'finite sequence';

  instantiate(libraryDataAccessor: LibraryDataAccessor, definition: Fmt.Definition): CachedPromise<SequenceMacroInstance> {
    let contents = definition.contents as FmtHLM.ObjectContents_MacroOperator;
    let variables: Fmt.ParameterList = contents.variables || Object.create(Fmt.ParameterList.prototype);
    let length = variables.getParameter('length');
    let references: Fmt.ArgumentList = contents.references || Object.create(Fmt.ArgumentList.prototype);
    let fixedLengthSequences = references.getValue('Fixed-length sequences');
    return CachedPromise.resolve(new SequenceMacroInstance(definition, length, fixedLengthSequences));
  }
}

export class SequenceMacroInstance implements HLMMacro.HLMMacroInstance {
  constructor(private definition: Fmt.Definition, private length: Fmt.Parameter, private fixedLengthSequences: Fmt.Expression) {}

  check(): CachedPromise<Logic.LogicCheckDiagnostic[]> {
    let result: CachedPromise<Logic.LogicCheckDiagnostic[]> = CachedPromise.resolve([]);
    // TODO
    return result;
  }

  invoke(utils: HLMUtils, path: Fmt.Path): CachedPromise<SequenceMacroInvocation> {
    let items = path.arguments.getValue('items') as Fmt.ArrayExpression;
    let fixedLengthSequencesRef = utils.substitutePath(this.fixedLengthSequences, path, [this.definition]);
    let length = new Fmt.IntegerExpression;
    length.value = new Fmt.BN(items.items.length);
    fixedLengthSequencesRef = utils.substituteVariable(fixedLengthSequencesRef, this.length, () => length);
    return CachedPromise.resolve(new SequenceMacroInvocation(fixedLengthSequencesRef));
  }
}

export class SequenceMacroInvocation implements HLMMacro.HLMMacroInvocation {
  constructor(private fixedLengthSequencesRef: Fmt.Expression) {}

  check(): CachedPromise<Logic.LogicCheckDiagnostic[]> {
    let result: CachedPromise<Logic.LogicCheckDiagnostic[]> = CachedPromise.resolve([]);
    // TODO
    return result;
  }

  getDeclaredSet(): CachedPromise<Fmt.Expression> {
    return CachedPromise.resolve(this.fixedLengthSequencesRef);
  }
}