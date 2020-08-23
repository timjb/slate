import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';
import { FileAccessor } from '../../shared/data/fileAccessor';
import { PhysicalFileAccessor } from '../../fs/data/physicalFileAccessor';
import { LibraryDataProvider, LibraryDataProviderOptions, LibraryDefinition, LibraryItemInfo } from '../../shared/data/libraryDataProvider';
import { fileExtension } from '../../shared/data/constants';
import * as Fmt from '../../shared/format/format';
import * as FmtReader from '../../shared/format/read';
import * as FmtLibrary from '../../shared/logics/library';
import * as FmtNotation from '../../shared/notation/meta';
import * as Logic from '../../shared/logics/logic';
import * as Logics from '../../shared/logics/logics';
import { renderAsHTML, HTMLAttributes, HTMLRenderer } from '../../shared/notation/htmlOutput';
import { UnicodeConversionOptions } from '../../shared/notation/unicode';
import CachedPromise from '../../shared/data/cachedPromise';

const Remarkable = require('remarkable').Remarkable;
const linkify = require('remarkable/linkify').linkify;

const renderedDefinitionOptions: Logic.RenderedDefinitionOptions = {
  includeLabel: true,
  includeExtras: true,
  includeRemarks: true
};

const unicodeConversionOptions: UnicodeConversionOptions = {
  convertStandardCharacters: false,
  shrinkMathSpaces: false
};

const ejsOptions: ejs.Options = {
  escape: (text) => text
};

function escapeCharacter(c: string): string {
  // Unfortunately, the established libraries either don't do exactly what we want or have broken Unicode support.
  switch (c) {
  case '&':
    return '&amp;';
  case '<':
    return '&lt;';
  case '>':
    return '&gt;';
  case '"':
    return '&quot;';
  default:
    return c;
  }
}

function escapeText(text: string): string {
  if (text.indexOf('&') >= 0 || text.indexOf('<') >= 0 || text.indexOf('>') >= 0 || text.indexOf('"') >= 0) {
    let result = '';
    for (let c of text) {
      result += escapeCharacter(c);
    }
    return result;
  } else {
    return text;
  }
}

class StaticHTMLRenderer implements HTMLRenderer<string> {
  renderText(text: string): string {
    return escapeText(text);
  }

  renderElement(tagName: string, attrs?: HTMLAttributes, content?: string): string {
    let tag = tagName;
    if (attrs) {
      for (let [key, value] of Object.entries(attrs)) {
        tag += ` ${key}="${escapeText(value)}"`;
      }
    }
    if (content) {
      return `<${tag}>${content}</${tag}>`;
    } else {
      return `<${tag} />`;
    }
  }

  concat(items: string[]): string {
    return items.join('');
  }

  renderMarkdown(markdown: string): string {
    let md = new Remarkable;
    md.use(linkify);
    return md.render(markdown);
  }
}

class StaticSiteGenerator {
  constructor(private htmlTemplateFileName: string, private templates: Fmt.File, private outputFileAccessor: FileAccessor) {}

  async buildSection(libraryDataProvider: LibraryDataProvider, sectionItemInfo: LibraryItemInfo) {
    let section = await libraryDataProvider.fetchLocalSection();
    let contents = section.definition.contents as FmtLibrary.ObjectContents_Section;
    let index = 0;
    for (let item of contents.items) {
      if (item instanceof FmtLibrary.MetaRefExpression_item || item instanceof FmtLibrary.MetaRefExpression_subsection) {
        let itemInfo: LibraryItemInfo = {
          itemNumber: [...sectionItemInfo.itemNumber, index + 1],
          type: item instanceof FmtLibrary.MetaRefExpression_item ? item.type : undefined,
          title: item.title
        };
        try {
          if (item instanceof FmtLibrary.MetaRefExpression_item) {
            let ref = item.ref as Fmt.DefinitionRefExpression;
            let definition = await libraryDataProvider.fetchLocalItem(ref.path.name, true);
            let uri = libraryDataProvider.pathToURI(ref.path);
            await this.buildItem(libraryDataProvider, itemInfo, definition, uri);
          } else if (item instanceof FmtLibrary.MetaRefExpression_subsection) {
            let ref = item.ref as Fmt.DefinitionRefExpression;
            let childProvider = await libraryDataProvider.getProviderForSection(ref.path);
            await this.buildSection(childProvider, itemInfo);
          }
        } catch (error) {
          console.error(error);
        }
      }
      index++;
    }
  }

  async buildItem(libraryDataProvider: LibraryDataProvider, itemInfo: LibraryItemInfo, definition: LibraryDefinition, uri: string) {
    let rendererOptions: Logic.LogicRendererOptions = {
      includeProofs: true
    };
    let renderer = Logics.hlm.getDisplay().getDefinitionRenderer(definition.definition, libraryDataProvider, this.templates, rendererOptions);
    let renderedDefinition = renderer.renderDefinition(CachedPromise.resolve(itemInfo), renderedDefinitionOptions);
    if (renderedDefinition) {
      let htmlRenderer = new StaticHTMLRenderer;
      let htmlContent = await renderAsHTML(renderedDefinition, htmlRenderer, unicodeConversionOptions);
      let html = await ejs.renderFile(this.htmlTemplateFileName, {'content': htmlContent}, ejsOptions);
      let outputFileReference = this.outputFileAccessor.openFile(uri, true);
      outputFileReference.write!(html, true);
    }
  }
}

function buildStaticPages(libraryFileName: string, logicName: string, htmlTemplateFileName: string, notationTemplateFileName: string, outputDirName: string) {
  let logic = Logics.findLogic(logicName);
  if (!logic) {
    throw new Error(`Logic ${logicName} not found`);
  }
  let libraryDataProviderOptions: LibraryDataProviderOptions = {
    logic: logic,
    fileAccessor: new PhysicalFileAccessor(path.dirname(libraryFileName)),
    watchForChanges: false,
    checkMarkdownCode: false,
    allowPlaceholders: false
  };
  let libraryDataProvider = new LibraryDataProvider(libraryDataProviderOptions, path.basename(libraryFileName, fileExtension));
  let templateFileContents = fs.readFileSync(notationTemplateFileName, 'utf8');
  let templates = FmtReader.readString(templateFileContents, notationTemplateFileName, FmtNotation.getMetaModel);
  let outputFileAccessor = new PhysicalFileAccessor(outputDirName);
  let staticSiteGenerator = new StaticSiteGenerator(htmlTemplateFileName, templates, outputFileAccessor);
  return staticSiteGenerator.buildSection(libraryDataProvider, {itemNumber: []});
}

if (process.argv.length !== 7) {
  console.error('usage: node buildStatic.js <libraryFile> <logic> <htmlTemplateFile> <notationTemplateFile> <outputDir>');
  process.exit(2);
}

buildStaticPages(process.argv[2], process.argv[3], process.argv[4], process.argv[5], process.argv[6])
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
