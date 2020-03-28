import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { FileAccessor, FileContents, WriteFileResult, FileWatcher } from '../../shared/data/fileAccessor';
import CachedPromise from '../../shared/data/cachedPromise';

export class PhysicalFileAccessor implements FileAccessor {
  constructor(private basePath?: string) {}

  readFile(uri: string): CachedPromise<FileContents> {
    let fileName = this.getFileName(uri);
    let contents = util.promisify(fs.readFile)(fileName, 'utf8')
      .then((text) => new PhysicalFileContents(fileName, text));
    return new CachedPromise(contents);
  }

  writeFile(uri: string, text: string, createNew: boolean, isPartOfGroup: boolean): CachedPromise<WriteFileResult> {
    let fileName = this.getFileName(uri);
    if (createNew) {
      this.makeDirectories(fileName);
    }
    let result = util.promisify(fs.writeFile)(fileName, text, 'utf8')
      .then(() => ({}));
    return new CachedPromise(result);
  }

  private getFileName(uri: string): string {
    let fileName = decodeURI(uri);
    if (this.basePath) {
      fileName = path.join(this.basePath, fileName);
    }
    return fileName;
  }

  private makeDirectories(fileName: string): void {
    let dirName = path.dirname(fileName);
    if (dirName && !fs.existsSync(dirName)) {
      this.makeDirectories(dirName);
      fs.mkdirSync(dirName);
    }
  }
}

class PhysicalFileContents implements FileContents {
  constructor(private fileName: string, public text: string) {}

  addWatcher(onChange: (watcher: FileWatcher) => void): FileWatcher {
    // This is currently racey. To fix it, we could re-read the file and compare its contents after creating the watcher.
    let watcher: FileWatcher;
    let listener = () => onChange(watcher);
    watcher = new PhysicalFileWatcher(this.fileName, listener);
    fs.watchFile(this.fileName, listener);
    return watcher;
  }
}

class PhysicalFileWatcher implements FileWatcher {
  constructor(private fileName: string, private listener?: () => void) {}

  close(): void {
    if (this.listener) {
      fs.unwatchFile(this.fileName, this.listener);
      this.listener = undefined;
    }
  }
}
