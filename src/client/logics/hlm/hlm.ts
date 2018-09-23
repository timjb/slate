import * as Logic from '../logic';
import * as FmtHLM from '../../../shared/logics/hlm/meta';
import { HLMDisplay } from './display';

export class HLM implements Logic.Logic {
  private display = new HLMDisplay;

  getMetaModel = FmtHLM.getMetaModel;
  getDisplay(): HLMDisplay { return this.display; }
}
