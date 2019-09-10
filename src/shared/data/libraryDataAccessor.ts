import CachedPromise from './cachedPromise';
import * as Fmt from '../format/format';

export interface LibraryDataAccessor {
  getAccessorForSection(path?: Fmt.PathItem): LibraryDataAccessor;
  fetchSubsection(path: Fmt.Path): CachedPromise<Fmt.Definition>;
  fetchItem(path: Fmt.Path): CachedPromise<Fmt.Definition>;
  getItemInfo(path: Fmt.Path): CachedPromise<LibraryItemInfo>;
  getAbsolutePath(path: Fmt.Path): Fmt.Path;
  getRelativePath(absolutePath: Fmt.Path): Fmt.Path;
  simplifyPath(path: Fmt.Path): Fmt.Path;
  arePathsEqual(left: Fmt.Path, right: Fmt.Path, unificationFn?: Fmt.ExpressionUnificationFn, replacedParameters?: Fmt.ReplacedParameter[]): boolean;
}

export type LibraryItemNumber = number[];

export function formatItemNumber(itemNumber: LibraryItemNumber): string {
  return itemNumber.join('.');
}

export interface LibraryItemInfo {
  itemNumber: LibraryItemNumber;
  type?: string;
  title?: string;
}
