import * as vscode from 'vscode';
import * as FmtReader from '../../../../shared/format/read';
import { fileExtension } from '../../../../shared/data/constants';
import { ParsedDocument, ParsedDocumentMap } from '../parsedDocument';
import { DefinitionLink, getDefinitionLinks, isDefinitionReferenceToUri, getNameDefinitionLocation } from '../navigate';
import { areUrisEqual } from '../../utils';
import { parseFile } from '../parse';

function containsLocation(locations: vscode.Location[], uri: vscode.Uri, range: vscode.Range): boolean {
    for (let location of locations) {
        if (areUrisEqual(uri, location.uri) && range.isEqual(location.range)) {
            return true;
        }
    }
    return false;
}

export function findReferences(nameDefinitionLocation: DefinitionLink, includeDeclaration: boolean, returnNameRanges: boolean, token: vscode.CancellationToken, sourceDocument?: vscode.TextDocument): Thenable<vscode.Location[]> {
    return vscode.workspace.findFiles(`**/*${fileExtension}`, undefined, undefined, token).then((originUris: vscode.Uri[]) => {
        let result: vscode.Location[] = [];
        if (nameDefinitionLocation && nameDefinitionLocation.targetSelectionRange) {
            if (includeDeclaration) {
                result.push(new vscode.Location(nameDefinitionLocation.targetUri, nameDefinitionLocation.targetSelectionRange));
            }
            let checkUri = (uri: vscode.Uri) => areUrisEqual(nameDefinitionLocation.targetUri, uri);
            let preCheck = (parsedDocument: ParsedDocument, rangeInfo: FmtReader.ObjectRangeInfo) =>
                isDefinitionReferenceToUri(parsedDocument, rangeInfo.object, rangeInfo.context, checkUri, sourceDocument);
            for (let originUri of originUris) {
                if (token.isCancellationRequested) {
                    break;
                }
                let parsedDocument = parseFile(originUri, true, undefined, undefined, sourceDocument, preCheck);
                if (parsedDocument) {
                    for (let rangeInfo of parsedDocument.rangeList) {
                        if (token.isCancellationRequested) {
                            break;
                        }
                        for (let definitionLink of getDefinitionLinks(parsedDocument, rangeInfo, undefined, false, sourceDocument, nameDefinitionLocation.targetUri)) {
                            if (areUrisEqual(definitionLink.targetUri, nameDefinitionLocation.targetUri) && definitionLink.targetSelectionRange && definitionLink.targetSelectionRange.isEqual(nameDefinitionLocation.targetSelectionRange)) {
                                let range = definitionLink.originSelectionRange && !returnNameRanges ? definitionLink.originSelectionRange : definitionLink.originNameRange;
                                if (!containsLocation(result, originUri, range)) {
                                    result.push(new vscode.Location(originUri, range));
                                }
                            }
                        }
                    }
                }
            }
        }
        return result;
    });
}

export class SlateReferenceProvider implements vscode.ReferenceProvider {
    constructor(private parsedDocuments: ParsedDocumentMap) {}

    provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location[]> {
        let parsedDocument = this.parsedDocuments.get(document);
        if (parsedDocument) {
            let nameDefinitionLocation = getNameDefinitionLocation(parsedDocument, position, document);
            if (nameDefinitionLocation) {
                return findReferences(nameDefinitionLocation, context.includeDeclaration, false, token, document);
            }
        }
        return undefined;
    }
}
